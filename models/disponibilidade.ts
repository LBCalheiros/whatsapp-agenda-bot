import { pool } from '@/infra/database';
import { AppError } from '@/infra/errors';
import { paraHorarioLocal, paraInstanteReal } from '@/infra/data';

type RegraDisponibilidade = {
  id: number;
  profissional_id: number;
  dia_semana: number;
  horario_inicio: string;
  horario_fim: string;
  intervalo_minutos: number;
  antecedencia_minima_horas: number;
};

function validarRegra(horarioInicio: string, horarioFim: string, intervaloMinutos: number) {
  if (horarioInicio >= horarioFim) {
    throw new AppError('Horário inicial precisa ser antes do horário final');
  }
  if (intervaloMinutos <= 0) {
    throw new AppError('Intervalo entre consultas precisa ser maior que zero');
  }
}

export async function criarRegraDisponibilidade(input: {
  profissionalId: number;
  diaSemana: number;
  horarioInicio: string;
  horarioFim: string;
  intervaloMinutos: number;
}) {
  const { profissionalId, diaSemana, horarioInicio, horarioFim, intervaloMinutos } = input;

  if (diaSemana < 0 || diaSemana > 6) {
    throw new AppError('Dia da semana inválido, use um número de 0 (domingo) a 6 (sábado)');
  }
  validarRegra(horarioInicio, horarioFim, intervaloMinutos);

  const { rows } = await pool.query(
    `INSERT INTO regras_disponibilidade
       (profissional_id, dia_semana, horario_inicio, horario_fim, intervalo_minutos)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [profissionalId, diaSemana, horarioInicio, horarioFim, intervaloMinutos],
  );

  return rows[0] as RegraDisponibilidade;
}

export async function upsertRegraDisponibilidade(input: {
  profissionalId: number;
  diaSemana: number;
  horarioInicio: string;
  horarioFim: string;
  intervaloMinutos: number;
}) {
  const { profissionalId, diaSemana, horarioInicio, horarioFim, intervaloMinutos } = input;

  if (diaSemana < 0 || diaSemana > 6) {
    throw new AppError('Dia da semana inválido, use um número de 0 (domingo) a 6 (sábado)');
  }
  validarRegra(horarioInicio, horarioFim, intervaloMinutos);

  const { rows } = await pool.query(
    `INSERT INTO regras_disponibilidade
       (profissional_id, dia_semana, horario_inicio, horario_fim, intervalo_minutos)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (profissional_id, dia_semana)
     DO UPDATE SET
       horario_inicio = EXCLUDED.horario_inicio,
       horario_fim = EXCLUDED.horario_fim,
       intervalo_minutos = EXCLUDED.intervalo_minutos
     RETURNING *`,
    [profissionalId, diaSemana, horarioInicio, horarioFim, intervaloMinutos],
  );

  return rows[0] as RegraDisponibilidade;
}

export async function removerRegraDisponibilidade(profissionalId: number, diaSemana: number) {
  await pool.query(
    `DELETE FROM regras_disponibilidade WHERE profissional_id = $1 AND dia_semana = $2`,
    [profissionalId, diaSemana],
  );
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

export async function listarBloqueios(profissionalId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM indisponibilidades
     WHERE profissional_id = $1 AND fim >= now()
     ORDER BY inicio`,
    [profissionalId],
  );
  return rows;
}

export async function removerBloqueio(bloqueioId: number) {
  const { rowCount } = await pool.query(`DELETE FROM indisponibilidades WHERE id = $1`, [
    bloqueioId,
  ]);
  if (rowCount === 0) {
    throw new AppError('Bloqueio não encontrado', 404);
  }
}

export async function obterProfissionalPadrao(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT id FROM profissionais WHERE ativo = true ORDER BY id LIMIT 1`,
  );
  if (rows.length === 0) {
    throw new AppError('Nenhum profissional ativo cadastrado', 404);
  }
  return rows[0].id;
}

export async function consultarHorariosDisponiveis(
  profissionalId: number,
  data: Date,
  duracaoMinutos: number,
): Promise<Date[]> {
  const dataLocal = paraHorarioLocal(data);
  const diaSemana = dataLocal.getUTCDay();

  const { rows: regras } = await pool.query(
    `SELECT r.*, p.antecedencia_minima_horas
   FROM regras_disponibilidade r
   JOIN profissionais p ON p.id = r.profissional_id
   WHERE r.profissional_id = $1 AND r.dia_semana = $2`,
    [profissionalId, diaSemana],
  );

  if (regras.length === 0) return [];
  const regra = regras[0] as RegraDisponibilidade;

  const candidatos: Date[] = [];
  const [horaIni, minIni] = regra.horario_inicio.split(':').map(Number);
  const [horaFim, minFim] = regra.horario_fim.split(':').map(Number);

  const inicioExpedienteLocal = new Date(dataLocal);
  inicioExpedienteLocal.setUTCHours(horaIni, minIni, 0, 0);
  const fimExpedienteLocal = new Date(dataLocal);
  fimExpedienteLocal.setUTCHours(horaFim, minFim, 0, 0);

  const inicioExpediente = paraInstanteReal(inicioExpedienteLocal);
  const fimExpediente = paraInstanteReal(fimExpedienteLocal);

  let cursor = new Date(inicioExpediente);
  while (cursor.getTime() + duracaoMinutos * 60_000 <= fimExpediente.getTime()) {
    candidatos.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + regra.intervalo_minutos * 60_000);
  }

  const antecedenciaMinimaMs = regra.antecedencia_minima_horas * 60 * 60 * 1000;
  const agora = Date.now();

  const inicioDiaLocal = new Date(dataLocal);
  inicioDiaLocal.setUTCHours(0, 0, 0, 0);
  const fimDiaLocal = new Date(dataLocal);
  fimDiaLocal.setUTCHours(23, 59, 59, 999);

  const inicioDia = paraInstanteReal(inicioDiaLocal);
  const fimDia = paraInstanteReal(fimDiaLocal);

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
    if (slot.getTime() - agora < antecedenciaMinimaMs) return false;

    const slotFim = new Date(slot.getTime() + duracaoMinutos * 60_000);

    const conflitaAgendamento = faixasOcupadas.some((f) => slot < f.fim && slotFim > f.inicio);
    if (conflitaAgendamento) return false;

    const conflitaBloqueio = bloqueios.some(
      (b) => slot < new Date(b.fim) && slotFim > new Date(b.inicio),
    );
    return !conflitaBloqueio;
  });
}

export async function consultarHorariosDisponiveisParaServico(
  servicoId: number,
  data: Date,
  duracaoMinutos: number,
): Promise<Date[]> {
  const { rows: profissionais } = await pool.query(
    `SELECT p.id FROM profissionais p
     JOIN profissional_servicos ps ON ps.profissional_id = p.id
     WHERE ps.servico_id = $1 AND p.ativo = true`,
    [servicoId],
  );

  const conjunto = new Map<number, Date>();
  for (const { id: profissionalId } of profissionais) {
    const horarios = await consultarHorariosDisponiveis(profissionalId, data, duracaoMinutos);
    for (const horario of horarios) {
      conjunto.set(horario.getTime(), horario);
    }
  }

  return [...conjunto.values()].sort((a, b) => a.getTime() - b.getTime());
}

// No momento de confirmar (não de listar), decide QUAL profissional específico
// vai ficar com o agendamento — o primeiro, entre os que atendem o serviço,
// que estiver realmente livre naquele instante exato. Reconfere do zero (não
// reaproveita o resultado da listagem), porque o tempo passou entre o cliente
// ver a lista e confirmar, e outro agendamento pode ter ocupado o horário.
export async function obterProfissionalDisponivel(
  servicoId: number,
  dataHora: Date,
  duracaoMinutos: number,
): Promise<number> {
  const { rows: profissionais } = await pool.query(
    `SELECT p.id FROM profissionais p
     JOIN profissional_servicos ps ON ps.profissional_id = p.id
     WHERE ps.servico_id = $1 AND p.ativo = true
     ORDER BY p.id`,
    [servicoId],
  );

  for (const { id: profissionalId } of profissionais) {
    const horarios = await consultarHorariosDisponiveis(profissionalId, dataHora, duracaoMinutos);
    if (horarios.some((h) => h.getTime() === dataHora.getTime())) {
      return profissionalId;
    }
  }

  throw new AppError('Esse horário acabou de ser ocupado, escolha outro');
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
