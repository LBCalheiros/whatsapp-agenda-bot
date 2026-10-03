import { Pool, PoolClient } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Roda várias queries como uma unidade atômica: se `fn` lançar em qualquer
// ponto, tudo é desfeito (ROLLBACK); se terminar sem erro, tudo é confirmado
// de uma vez (COMMIT). Usa um client dedicado da pool pra garantir que todas
// as queries de `fn` rodem na mesma conexão/transação.
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
