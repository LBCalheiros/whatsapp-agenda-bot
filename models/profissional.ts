import { pool } from '@/infra/database';

export async function listarProfissionaisAtivos() {
  const { rows } = await pool.query(
    `SELECT id, nome FROM profissionais WHERE ativo = true ORDER BY nome`,
  );
  return rows;
}
