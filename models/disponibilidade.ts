import { pool } from '@/infra/database';
import { AppError } from '@/infra/errors';

type RegraDisponibilidade = {
  id: number;
  profissional_id: number;
  dia_semana: number;
  horario_inicio: string;
  horario_fim: string;
  intervalo_minutos: number;
};

export async function criarRegraDisponibilidade(input: {
  profissionalId: number;
  diaSemana: number;
  horarioInicio: string; // formato "HH:mm"
  horarioFim: string;
  intervaloMinutos: number;
}) {
  const { profissionalId, diaSemana, horarioInicio, horarioFim, intervaloMinutos } = input;

  if (diaSemana < 0 || diaSemana > 6) {
    throw new AppError('Dia da semana inválido, use um número de 0 (domingo) a 6 (sábado)');
  }
  if (horarioInicio >= horarioFim) {
    throw new AppError('Horário inicial precisa ser antes do horário final');
  }
  if (intervaloMinutos <= 0) {
    throw new AppError('Intervalo entre consultas precisa ser maior que zero');
  }

  const { rows } = await pool.query(
    `INSERT INTO regras_disponibilidade
       (profissional_id, dia_semana, horario_inicio, horario_fim, intervalo_minutos)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [profissionalId, diaSemana, horarioInicio, horarioFim, intervaloMinutos],
  );

  return rows[0] as RegraDisponibilidade;
}

export async function listarRegras(profissionalId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM regras_disponibilidade WHERE profissional_id = $1 ORDER BY dia_semana`,
    [profissionalId],
  );
  return rows as RegraDisponibilidade[];
}

export async function criarBloqueio(input: {
  profissionalId: number;
  inicio: Date;
  fim: Date;
  motivo?: string;
}) {
  const { profissionalId, inicio, fim, motivo } = input;

  if (inicio >= fim) {
    throw new AppError('Início do bloqueio precisa ser antes do fim');
  }

  const { rows } = await pool.query(
    `INSERT INTO indisponibilidades (profissional_id, inicio, fim, motivo)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [profissionalId, inicio, fim, motivo ?? null],
  );

  return rows[0];
}

export async function consultarHorariosDisponiveis(
  profissionalId: number,
  data: Date,
  duracaoMinutos: number,
): Promise<Date[]> {
  const diaSemana = data.getDay();

  const { rows: regras } = await pool.query(
    `SELECT * FROM regras_disponibilidade WHERE profissional_id = $1 AND dia_semana = $2`,
    [profissionalId, diaSemana],
  );

  if (regras.length === 0) return [];
  const regra = regras[0] as RegraDisponibilidade;

  const candidatos: Date[] = [];
  const [horaIni, minIni] = regra.horario_inicio.split(':').map(Number);
  const [horaFim, minFim] = regra.horario_fim.split(':').map(Number);

  const inicioExpediente = new Date(data);
  inicioExpediente.setHours(horaIni, minIni, 0, 0);
  const fimExpediente = new Date(data);
  fimExpediente.setHours(horaFim, minFim, 0, 0);

  let cursor = new Date(inicioExpediente);
  while (cursor.getTime() + duracaoMinutos * 60_000 <= fimExpediente.getTime()) {
    candidatos.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + regra.intervalo_minutos * 60_000);
  }

  const inicioDia = new Date(data);
  inicioDia.setHours(0, 0, 0, 0);
  const fimDia = new Date(data);
  fimDia.setHours(23, 59, 59, 999);

  const { rows: ocupados } = await pool.query(
    `SELECT a.data_hora, s.duracao_minutos
     FROM agendamentos a
     JOIN servicos s ON s.id = a.servico_id
     WHERE a.profissional_id = $1 AND a.data_hora BETWEEN $2 AND $3 AND a.status != 'cancelado'`,
    [profissionalId, inicioDia, fimDia],
  );

  const faixasOcupadas = ocupados.map((r) => {
    const inicio = new Date(r.data_hora);
    const fim = new Date(inicio.getTime() + r.duracao_minutos * 60_000);
    return { inicio, fim };
  });

  const { rows: bloqueios } = await pool.query(
    `SELECT inicio, fim FROM indisponibilidades
     WHERE profissional_id = $1 AND inicio < $3 AND fim > $2`,
    [profissionalId, inicioDia, fimDia],
  );

  return candidatos.filter((slot) => {
    const slotFim = new Date(slot.getTime() + duracaoMinutos * 60_000);

    const conflitaAgendamento = faixasOcupadas.some((f) => slot < f.fim && slotFim > f.inicio);
    if (conflitaAgendamento) return false;

    const conflitaBloqueio = bloqueios.some(
      (b) => slot < new Date(b.fim) && slotFim > new Date(b.inicio),
    );
    return !conflitaBloqueio;
  });
}

export async function validarHorarioDisponivel(
  profissionalId: number,
  dataHora: Date,
  duracaoMinutos: number,
) {
  const disponiveis = await consultarHorariosDisponiveis(profissionalId, dataHora, duracaoMinutos);
  const valido = disponiveis.some((d) => d.getTime() === dataHora.getTime());

  if (!valido) {
    throw new AppError('Horário fora do expediente ou indisponível para agendamento');
  }
}
