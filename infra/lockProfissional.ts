import { pool } from '@/infra/database';

export async function comLockDeProfissional<T>(
  profissionalId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [`profissional:${profissionalId}`]);

    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
        `profissional:${profissionalId}`,
      ]);
    }
  } finally {
    client.release();
  }
}
