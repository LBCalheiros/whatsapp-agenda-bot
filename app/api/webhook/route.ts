import { logger } from '@/infra/logger';
import { processarMensagem } from '@/models/conversa';
import { reivindicarMensagem, liberarMensagem } from '@/infra/idempotenciaWebhook';
import { verificarAssinaturaWebhook } from '@/infra/assinaturaWebhook';

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

type MensagemWhatsapp = {
  id?: string;
  from: string;
  type: string;
  text?: { body: string };
  interactive?: { type: string; button_reply?: { id: string } };
  button?: { payload: string };
};

async function processarConteudo(numeroCliente: string, message: MensagemWhatsapp) {
  const tipoMensagem = message.type;

  if (tipoMensagem === 'text' && message.text) {
    await processarMensagem(numeroCliente, { tipo: 'texto', valor: message.text.body });
  } else if (tipoMensagem === 'interactive' && message.interactive?.type === 'button_reply') {
    await processarMensagem(numeroCliente, {
      tipo: 'botao',
      id: message.interactive.button_reply!.id,
    });
  } else if (tipoMensagem === 'button' && message.button) {
    await processarMensagem(numeroCliente, {
      tipo: 'botao',
      id: message.button.payload,
    });
  }
}

export async function POST(request: Request) {
  const payload = await request.text();

  if (!process.env.WHATSAPP_APP_SECRET) {
    logger.error('WHATSAPP_APP_SECRET não configurado; webhook recusado');
    return Response.json({ ok: false }, { status: 500 });
  }

  const assinatura = request.headers.get('x-hub-signature-256');
  if (!verificarAssinaturaWebhook(payload, assinatura)) {
    logger.warn('Webhook recusado: assinatura inválida');
    return new Response('Forbidden', { status: 403 });
  }

  let body: { entry?: Array<{ changes?: Array<{ value?: { messages?: MensagemWhatsapp[] } }> }> };
  try {
    body = JSON.parse(payload);
  } catch (error) {
    logger.warn({ error }, 'Webhook recebeu JSON inválido');
    return Response.json({ ok: false }, { status: 400 });
  }

  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (!message) {
    logger.info({ body }, 'Webhook recebido sem mensagem de cliente');
    return Response.json({ ok: true });
  }

  const numeroCliente = message.from;
  const messageId = message.id;

  logger.info(
    { numeroCliente, tipoMensagem: message.type, message },
    'Mensagem recebida do WhatsApp',
  );

  if (!messageId) {
    logger.warn({ message }, 'Mensagem sem message.id — processando sem checagem de duplicidade');
    try {
      await processarConteudo(numeroCliente, message);
      return Response.json({ ok: true });
    } catch (error) {
      logger.error({ error }, 'Erro ao processar webhook do WhatsApp (sem message.id)');
      return Response.json({ ok: false }, { status: 500 });
    }
  }

  const podeProcessar = await reivindicarMensagem(messageId);
  if (!podeProcessar) {
    logger.info({ messageId }, 'Mensagem duplicada da Meta, ignorando');
    return Response.json({ ok: true });
  }

  try {
    await processarConteudo(numeroCliente, message);
    return Response.json({ ok: true });
  } catch (error) {
    await liberarMensagem(messageId);
    logger.error({ error, messageId }, 'Erro ao processar webhook do WhatsApp');
    return Response.json({ ok: false }, { status: 500 });
  }
}
