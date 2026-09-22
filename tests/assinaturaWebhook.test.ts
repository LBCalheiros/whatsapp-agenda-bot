import { createHmac } from 'crypto';
import { verificarAssinaturaWebhook } from '@/infra/assinaturaWebhook';

describe('assinatura do webhook', () => {
  const segredo = 'segredo-de-teste';
  const payload = '{"object":"whatsapp_business_account"}';

  beforeAll(() => {
    process.env.WHATSAPP_APP_SECRET = segredo;
  });

  it('aceita uma assinatura válida', () => {
    const hash = createHmac('sha256', segredo).update(payload).digest('hex');

    expect(verificarAssinaturaWebhook(payload, `sha256=${hash}`)).toBe(true);
  });

  it('rejeita uma assinatura adulterada', () => {
    const hash = createHmac('sha256', segredo).update(payload).digest('hex');
    const adulterado = `${hash.slice(0, -1)}${hash.endsWith('0') ? '1' : '0'}`;

    expect(verificarAssinaturaWebhook(payload, `sha256=${adulterado}`)).toBe(false);
  });

  it('rejeita uma assinatura com prefixo inválido', () => {
    const hash = createHmac('sha256', segredo).update(payload).digest('hex');

    expect(verificarAssinaturaWebhook(payload, `md5=${hash}`)).toBe(false);
  });

  it('rejeita assinatura ausente', () => {
    expect(verificarAssinaturaWebhook(payload, null)).toBe(false);
  });
});
