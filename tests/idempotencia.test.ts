import { pool } from '@/infra/database';
import { reivindicarMensagem, liberarMensagem } from '@/infra/idempotenciaWebhook';

function novoId(sufixo: string) {
  return `wamid.teste-idempotencia-${Date.now()}-${sufixo}`;
}

describe('infra/idempotenciaWebhook', () => {
  afterAll(async () => {
    await pool.query(
      `DELETE FROM mensagens_whatsapp_processadas WHERE id LIKE 'wamid.teste-idempotencia-%'`,
    );
    await pool.end();
  });

  it('reivindica uma mensagem nova com sucesso', async () => {
    const podeProcessar = await reivindicarMensagem(novoId('a'));
    expect(podeProcessar).toBe(true);
  });

  it('rejeita reivindicar a mesma mensagem duas vezes', async () => {
    const messageId = novoId('b');
    const primeira = await reivindicarMensagem(messageId);
    const segunda = await reivindicarMensagem(messageId);

    expect(primeira).toBe(true);
    expect(segunda).toBe(false);
  });

  it('permite reivindicar de novo depois de liberar', async () => {
    const messageId = novoId('c');
    await reivindicarMensagem(messageId);
    await liberarMensagem(messageId);

    const podeProcessar = await reivindicarMensagem(messageId);
    expect(podeProcessar).toBe(true);
  });

  it('reivindicações concorrentes da mesma mensagem: só uma ganha', async () => {
    const messageId = novoId('concorrente');

    const resultados = await Promise.all([
      reivindicarMensagem(messageId),
      reivindicarMensagem(messageId),
      reivindicarMensagem(messageId),
    ]);

    const vitorias = resultados.filter(Boolean).length;
    expect(vitorias).toBe(1);
  });
});
