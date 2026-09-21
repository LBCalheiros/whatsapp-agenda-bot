import { pool } from '@/infra/database';
import { AppError } from '@/infra/errors';
import { enviarMensagemTexto } from '@/infra/whatsapp';
import { logger } from '@/infra/logger';

export type StatusAtendimento = 'bot_ativo' | 'aguardando_humano' | 'humano_ativo' | 'encerrado';

const STATUS_VALIDOS: StatusAtendimento[] = [
  'bot_ativo',
  'aguardando_humano',
  'humano_ativo',
  'encerrado',
];

export async function iniciarAtendimento(clienteId: number, agendamentoId: number | null = null) {
  const existente = await buscarAtendimentoAbertoPorCliente(clienteId);
  if (existente) return existente;

  const { rows } = await pool.query(
    `INSERT INTO conversas_atendimento (cliente_id, agendamento_id, status)
     VALUES ($1, $2, 'aguardando_humano') RETURNING *`,
    [clienteId, agendamentoId],
  );
  const atendimento = rows[0];

  await notificarFuncionariosNovoAtendimento(clienteId);

  return atendimento;
}

async function notificarFuncionariosNovoAtendimento(clienteId: number) {
  const { rows: funcionarios } = await pool.query(
    `SELECT telefone_notificacao FROM usuarios_admin WHERE telefone_notificacao IS NOT NULL`,
  );
  if (funcionarios.length === 0) return;

  const { rows: clientesEncontrados } = await pool.query(
    `SELECT nome, telefone FROM clientes WHERE id = $1`,
    [clienteId],
  );
  const cliente = clientesEncontrados[0];
  const identificacao = cliente?.nome || cliente?.telefone || 'um cliente';
  const texto = `Novo atendimento aguardando: ${identificacao} pediu pra falar com um atendente.`;

  for (const funcionario of funcionarios) {
    try {
      await enviarMensagemTexto(funcionario.telefone_notificacao, texto);
    } catch (error) {
      // não deixa a falha de notificação quebrar a criação do atendimento
      logger.error(
        { error, telefone: funcionario.telefone_notificacao },
        'Falha ao notificar funcionário sobre novo atendimento',
      );
    }
  }
}

export async function buscarAtendimentoAbertoPorCliente(clienteId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM conversas_atendimento
     WHERE cliente_id = $1 AND status IN ('aguardando_humano', 'humano_ativo')
     ORDER BY criado_em DESC LIMIT 1`,
    [clienteId],
  );
  return rows[0] ?? null;
}

export async function buscarAtendimentoAbertoPorTelefone(telefone: string) {
  const { rows } = await pool.query(
    `SELECT ca.* FROM conversas_atendimento ca
     JOIN clientes c ON c.id = ca.cliente_id
     WHERE c.telefone = $1 AND ca.status IN ('aguardando_humano', 'humano_ativo')
     ORDER BY ca.criado_em DESC LIMIT 1`,
    [telefone],
  );
  return rows[0] ?? null;
}

export async function listarAtendimentos(filtros: { status?: string } = {}) {
  const condicoes: string[] = [];
  const valores: unknown[] = [];

  if (filtros.status) {
    if (!STATUS_VALIDOS.includes(filtros.status as StatusAtendimento)) {
      throw new AppError('Status inválido');
    }
    valores.push(filtros.status);
    condicoes.push(`ca.status = $${valores.length}`);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT ca.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
            u.email AS funcionario_email,
            a.data_hora AS agendamento_data_hora, s.nome AS agendamento_servico_nome
     FROM conversas_atendimento ca
     JOIN clientes c ON c.id = ca.cliente_id
     LEFT JOIN usuarios_admin u ON u.id = ca.funcionario_id
     LEFT JOIN agendamentos a ON a.id = ca.agendamento_id
     LEFT JOIN servicos s ON s.id = a.servico_id
     ${where}
     ORDER BY ca.criado_em DESC`,
    valores,
  );
  return rows;
}

export async function buscarAtendimentoPorId(id: number) {
  const { rows } = await pool.query(`SELECT * FROM conversas_atendimento WHERE id = $1`, [id]);
  if (rows.length === 0) {
    throw new AppError('Atendimento não encontrado', 404);
  }
  return rows[0];
}

export async function assumirAtendimento(id: number, funcionarioId: number) {
  const atendimento = await buscarAtendimentoPorId(id);

  if (atendimento.status === 'encerrado') {
    throw new AppError('Esse atendimento já foi encerrado');
  }

  const { rows } = await pool.query(
    `UPDATE conversas_atendimento
     SET funcionario_id = $1, status = 'humano_ativo', atualizado_em = now()
     WHERE id = $2 RETURNING *`,
    [funcionarioId, id],
  );
  return rows[0];
}

export async function encerrarAtendimento(id: number) {
  const atendimento = await buscarAtendimentoPorId(id);

  if (atendimento.status === 'encerrado') {
    throw new AppError('Esse atendimento já está encerrado');
  }

  const { rows } = await pool.query(
    `UPDATE conversas_atendimento SET status = 'encerrado', atualizado_em = now()
     WHERE id = $1 RETURNING *`,
    [id],
  );
  return rows[0];
}

export async function listarMensagens(atendimentoId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM mensagens_atendimento
     WHERE conversa_atendimento_id = $1 ORDER BY criado_em ASC`,
    [atendimentoId],
  );
  return rows;
}

export async function registrarMensagem(
  atendimentoId: number,
  remetente: 'cliente' | 'funcionario',
  texto: string,
) {
  const { rows } = await pool.query(
    `INSERT INTO mensagens_atendimento (conversa_atendimento_id, remetente, texto)
     VALUES ($1, $2, $3) RETURNING *`,
    [atendimentoId, remetente, texto],
  );
  return rows[0];
}
