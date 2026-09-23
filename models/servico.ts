import { pool } from '@/infra/database';

export async function listarServicosAtivos() {
  const { rows } = await pool.query(
    `SELECT id, nome, duracao_minutos, preco FROM servicos WHERE ativo = true ORDER BY nome`,
  );
  return rows;
}
