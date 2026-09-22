import { createHmac, timingSafeEqual } from 'crypto';

const PREFIXO_ASSINATURA = 'sha256=';

export function verificarAssinaturaWebhook(
  payload: string,
  assinaturaRecebida: string | null,
): boolean {
  const segredo = process.env.WHATSAPP_APP_SECRET;
  if (!segredo || !assinaturaRecebida?.startsWith(PREFIXO_ASSINATURA)) {
    return false;
  }

  const hashRecebido = assinaturaRecebida.slice(PREFIXO_ASSINATURA.length);
  if (!/^[0-9a-f]{64}$/i.test(hashRecebido)) {
    return false;
  }

  const hashEsperado = createHmac('sha256', segredo).update(payload).digest('hex');
  const bufferRecebido = Buffer.from(hashRecebido, 'hex');
  const bufferEsperado = Buffer.from(hashEsperado, 'hex');

  return (
    bufferRecebido.length === bufferEsperado.length &&
    timingSafeEqual(bufferRecebido, bufferEsperado)
  );
}
