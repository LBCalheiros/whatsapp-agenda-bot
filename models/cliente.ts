import { pool } from '@/infra/database';
import { AppError } from '@/infra/errors';

export type Cliente = {
  id: number;
  telefone: string;
  nome: string | null;
  criado_em: string;
};

export async function buscarOuCriarClientePorTelefone(telefone: string): Promise<Cliente> {
  const { rows } = await pool.query(`SELECT * FROM clientes WHERE telefone = $1`, [telefone]);

  if (rows.length > 0) {
    return rows[0] as Cliente;
  }

  const { rows: criados } = await pool.query(
    `INSERT INTO clientes (telefone) VALUES ($1) RETURNING *`,
    [telefone],
  );
  return criados[0] as Cliente;
}

export async function atualizarNomeCliente(id: number, nome: string): Promise<Cliente> {
  const { rows } = await pool.query(`UPDATE clientes SET nome = $1 WHERE id = $2 RETURNING *`, [
    nome,
    id,
  ]);
  if (rows.length === 0) {
    throw new AppError('Cliente não encontrado', 404);
  }
  return rows[0] as Cliente;
}
