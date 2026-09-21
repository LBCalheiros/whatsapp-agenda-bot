import { pool } from '@/infra/database';

/**
 * Serializa a execução de `fn` por telefone usando um advisory lock do Postgres.
 * Diferente de um mutex em memória, isso funciona corretamente mesmo se o app
 * rodar em múltiplas instâncias (ex: funções serverless da Vercel), porque o
 * lock vive no banco, não no processo Node.
 *
 * `pg_advisory_lock` bloqueia até conseguir o lock — uma segunda mensagem do
 * mesmo telefone simplesmente espera a primeira terminar antes de começar,
 * em vez de ler o estado da conversa em paralelo.
 */
export async function comLockDeConversa<T>(telefone: string, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [telefone]);
    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [telefone]);
    }
  } finally {
    client.release();
  }
}
