import { AppError } from 'infra/errors';
import { logger } from '@/infra/logger';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response('Forbidden', { status: 403 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
      logger.info({ body }, 'Webhook recebido sem mensagem de cliente');
      return Response.json({ ok: true });
    }

    const numeroCliente = message.from;
    const tipoMensagem = message.type;

    logger.info({ numeroCliente, tipoMensagem, message }, 'Mensagem recebida do WhatsApp');

    return Response.json({ ok: true });
  } catch (error) {
    logger.error({ error }, 'Erro ao processar webhook do WhatsApp');
    return Response.json({ ok: true });
  }
}
