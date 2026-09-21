import { pool } from '@/infra/database';

/**
 * Tenta "reivindicar" um message.id da Meta pra processar. Retorna true se
 * ninguém tinha reivindicado ainda (deve processar), false se já foi
 * reivindicado antes (mensagem duplicada, deve ignorar).
 */
export async function reivindicarMensagem(messageId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO mensagens_whatsapp_processadas (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [messageId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Libera uma mensagem reivindicada quando o processamento falha, permitindo
 * que uma reentrega da Meta tente de novo em vez de ser descartada como duplicata.
 */
export async function liberarMensagem(messageId: string): Promise<void> {
  await pool.query(`DELETE FROM mensagens_whatsapp_processadas WHERE id = $1`, [messageId]);
}
