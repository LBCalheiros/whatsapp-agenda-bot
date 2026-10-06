import { pool } from '@/infra/database';

export async function comLockDeAgendamento<T>(
  agendamentoId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [`agendamento:${agendamentoId}`]);

    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
        `agendamento:${agendamentoId}`,
      ]);
    }
  } finally {
    client.release();
  }
}
