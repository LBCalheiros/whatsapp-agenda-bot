import { pool } from '@/infra/database';
import { AppError } from '@/infra/errors';
import { validarHorarioDisponivel } from '@/models/disponibilidade';

type Agendamento = {
  id: number;
  cliente_id: number;
  profissional_id: number;
  servico_id: number;
  data_hora: string;
  status: string;
  lembrete_enviado: boolean;
};

export async function criarAgendamento(input: {
  clienteId: number;
  profissionalId: number;
  servicoId: number;
  dataHora: Date;
}) {
  const { clienteId, profissionalId, servicoId, dataHora } = input;

  const { rows: servicos } = await pool.query(
    `SELECT duracao_minutos FROM servicos WHERE id = $1 AND ativo = true`,
    [servicoId],
  );
  if (servicos.length === 0) {
    throw new AppError('Serviço não encontrado ou inativo');
  }
  const duracaoMinutos = servicos[0].duracao_minutos;

  await validarHorarioDisponivel(profissionalId, dataHora, duracaoMinutos);

  function ehViolacaoDeConstraintUnica(error: unknown): error is { code: string } {
    return typeof error === 'object' && error !== null && 'code' in error;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO agendamentos (cliente_id, profissional_id, servico_id, data_hora)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [clienteId, profissionalId, servicoId, dataHora],
    );
    return rows[0] as Agendamento;
  } catch (error) {
    if (ehViolacaoDeConstraintUnica(error) && error.code === '23505') {
      throw new AppError('Esse horário acabou de ser ocupado, escolha outro');
    }
    throw error;
  }
}

export async function listarAgendamentos(filtros: {
  profissionalId?: number;
  data?: Date;
  status?: string;
}) {
  const condicoes: string[] = [];
  const valores: unknown[] = [];

  if (filtros.profissionalId) {
    valores.push(filtros.profissionalId);
    condicoes.push(`a.profissional_id = $${valores.length}`);
  }
  if (filtros.status) {
    valores.push(filtros.status);
    condicoes.push(`a.status = $${valores.length}`);
  }
  if (filtros.data) {
    const inicioDia = new Date(filtros.data);
    inicioDia.setHours(0, 0, 0, 0);
    const fimDia = new Date(filtros.data);
    fimDia.setHours(23, 59, 59, 999);
    valores.push(inicioDia, fimDia);
    condicoes.push(`a.data_hora BETWEEN $${valores.length - 1} AND $${valores.length}`);
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT
       a.*,
       c.nome AS cliente_nome, c.telefone AS cliente_telefone,
       p.nome AS profissional_nome,
       s.nome AS servico_nome, s.duracao_minutos
     FROM agendamentos a
     JOIN clientes c ON c.id = a.cliente_id
     JOIN profissionais p ON p.id = a.profissional_id
     JOIN servicos s ON s.id = a.servico_id
     ${where}
     ORDER BY a.data_hora`,
    valores,
  );

  return rows;
}

export async function buscarPorId(agendamentoId: number): Promise<Agendamento> {
  const { rows } = await pool.query(`SELECT * FROM agendamentos WHERE id = $1`, [agendamentoId]);
  if (rows.length === 0) {
    throw new AppError('Agendamento não encontrado', 404);
  }
  return rows[0];
}

// operação neutra, sem regra de prazo — usada pelo painel
export async function cancelarAgendamento(agendamentoId: number) {
  const agendamento = await buscarPorId(agendamentoId);

  await pool.query(`UPDATE agendamentos SET status = 'cancelado' WHERE id = $1`, [agendamentoId]);

  await registrarHistorico(agendamentoId, agendamento.status, 'cancelado');
}

// caminho do cliente pelo bot (#7): aplica a regra de 24h e delega pra neutra
export async function cancelarComoCliente(agendamentoId: number) {
  const agendamento = await buscarPorId(agendamentoId);

  const horasAteAgendamento =
    (new Date(agendamento.data_hora).getTime() - Date.now()) / (1000 * 60 * 60);

  if (horasAteAgendamento < 24) {
    throw new AppError('Cancelamento só é permitido até 24h antes do horário agendado');
  }

  return cancelarAgendamento(agendamentoId);
}

export async function reagendarAgendamento(agendamentoId: number, novaDataHora: Date) {
  const agendamento = await buscarPorId(agendamentoId);

  const { rows: servicos } = await pool.query(
    `SELECT duracao_minutos FROM servicos WHERE id = $1`,
    [agendamento.servico_id],
  );
  const duracaoMinutos = servicos[0].duracao_minutos;

  await validarHorarioDisponivel(agendamento.profissional_id, novaDataHora, duracaoMinutos);

  await pool.query(`UPDATE agendamentos SET data_hora = $1 WHERE id = $2`, [
    novaDataHora,
    agendamentoId,
  ]);

  await registrarHistorico(
    agendamentoId,
    agendamento.status,
    agendamento.status,
    agendamento.data_hora,
  );
}

async function registrarHistorico(
  agendamentoId: number,
  statusAnterior: string,
  statusNovo: string,
  dataHoraAnterior?: string,
) {
  await pool.query(
    `INSERT INTO historico_agendamentos
       (agendamento_id, status_anterior, status_novo, data_hora_anterior)
     VALUES ($1, $2, $3, $4)`,
    [agendamentoId, statusAnterior, statusNovo, dataHoraAnterior ?? null],
  );
}
