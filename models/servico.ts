import { pool } from '@/infra/database';
import { AppError } from '@/infra/errors';

export type Servico = {
  id: number;
  nome: string;
  duracao_minutos: number;
  preco: string | null; // numeric vem como string do pg, formatação fica pro frontend
  ativo: boolean;
};

export async function listarServicosAtivos() {
  const { rows } = await pool.query(
    `SELECT id, nome, duracao_minutos, preco FROM servicos WHERE ativo = true ORDER BY nome`,
  );
  return rows;
}

// Usada pela tela de gestão — mostra inativos também, pra dar pra reativar.
export async function listarTodosServicos() {
  const { rows } = await pool.query(
    `SELECT id, nome, duracao_minutos, preco, ativo FROM servicos ORDER BY ativo DESC, nome`,
  );
  return rows as Servico[];
}

export async function buscarServicoPorId(id: number) {
  const { rows } = await pool.query(
    `SELECT id, nome, duracao_minutos, preco, ativo FROM servicos WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) {
    throw new AppError('Serviço não encontrado', 404);
  }
  return rows[0] as Servico;
}

function validarServico(nome: string, duracaoMinutos: number) {
  if (!nome.trim()) {
    throw new AppError('Nome do serviço não pode ser vazio');
  }
  if (duracaoMinutos <= 0) {
    throw new AppError('Duração precisa ser maior que zero');
  }
}

export async function criarServico(input: {
  nome: string;
  duracaoMinutos: number;
  preco?: number | null;
}) {
  validarServico(input.nome, input.duracaoMinutos);

  const { rows } = await pool.query(
    `INSERT INTO servicos (nome, duracao_minutos, preco)
     VALUES ($1, $2, $3)
     RETURNING id, nome, duracao_minutos, preco, ativo`,
    [input.nome.trim(), input.duracaoMinutos, input.preco ?? null],
  );
  return rows[0] as Servico;
}

// Edita nome/duração/preço. Mudar a duração de um serviço que já tem
// agendamentos futuros NÃO recalcula nem invalida os existentes — eles
// mantêm a duração que tinham no momento em que foram criados (é assim que
// consultarHorariosDisponiveis já funciona, lendo o valor atual da tabela
// servicos só na hora de calcular NOVOS horários livres, não retroativo).
export async function atualizarServico(
  id: number,
  dados: { nome?: string; duracaoMinutos?: number; preco?: number | null },
) {
  const atual = await buscarServicoPorId(id);
  const nome = dados.nome ?? atual.nome;
  const duracaoMinutos = dados.duracaoMinutos ?? atual.duracao_minutos;
  validarServico(nome, duracaoMinutos);

  const campos: string[] = [];
  const valores: unknown[] = [];

  valores.push(nome);
  campos.push(`nome = $${valores.length}`);
  valores.push(duracaoMinutos);
  campos.push(`duracao_minutos = $${valores.length}`);
  if (dados.preco !== undefined) {
    valores.push(dados.preco);
    campos.push(`preco = $${valores.length}`);
  }

  valores.push(id);
  const { rows } = await pool.query(
    `UPDATE servicos SET ${campos.join(', ')} WHERE id = $${valores.length}
     RETURNING id, nome, duracao_minutos, preco, ativo`,
    valores,
  );
  return rows[0] as Servico;
}

export async function definirAtivoServico(id: number, ativo: boolean) {
  const { rows } = await pool.query(
    `UPDATE servicos SET ativo = $1 WHERE id = $2
     RETURNING id, nome, duracao_minutos, preco, ativo`,
    [ativo, id],
  );
  if (rows.length === 0) {
    throw new AppError('Serviço não encontrado', 404);
  }
  return rows[0] as Servico;
}
