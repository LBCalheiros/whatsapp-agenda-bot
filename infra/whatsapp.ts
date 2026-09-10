import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';

const WHATSAPP_API_VERSION = 'v21.0';

function montarUrl(): string {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
}

async function chamarApiComRetry(body: Record<string, unknown>, tentativas = 3): Promise<Response> {
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const response = await fetch(montarUrl(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.status >= 500 || response.status === 429) {
        throw new Error(`Erro temporário da API (status ${response.status})`);
      }

      return response;
    } catch (error) {
      ultimoErro = error;
      if (tentativa < tentativas) {
        const esperaMs = 500 * 2 ** (tentativa - 1);
        logger.warn(
          { tentativa, esperaMs, error },
          'Falha temporária ao chamar API do WhatsApp, tentando de novo',
        );
        await new Promise((resolve) => setTimeout(resolve, esperaMs));
      }
    }
  }

  throw ultimoErro;
}

async function processarResposta(response: Response) {
  const data = await response.json();

  if (!response.ok) {
    const erro = data?.error;
    const codigo = erro?.code;

    if (codigo === 130497) {
      throw new AppError(
        'Conta restrita para enviar mensagem a esse país (limitação da Meta, não do código)',
        502,
      );
    }
    if (codigo === 190) {
      throw new AppError('Token de acesso do WhatsApp expirado ou inválido', 401);
    }

    logger.error({ erro }, 'Erro retornado pela API do WhatsApp');
    throw new AppError(erro?.message ?? 'Erro ao enviar mensagem pelo WhatsApp', 502);
  }

  return data;
}

export async function enviarMensagemTexto(telefone: string, texto: string) {
  const response = await chamarApiComRetry({
    messaging_product: 'whatsapp',
    to: telefone,
    type: 'text',
    text: { body: texto },
  });

  return processarResposta(response);
}

export async function enviarMensagemTemplateComBotoes(input: {
  telefone: string;
  nomeTemplate: string;
  idiomaCodigo: string;
  parametrosCorpo: string[];
  payloadsBotoes: string[];
}) {
  const { telefone, nomeTemplate, idiomaCodigo, parametrosCorpo, payloadsBotoes } = input;

  const response = await chamarApiComRetry({
    messaging_product: 'whatsapp',
    to: telefone,
    type: 'template',
    template: {
      name: nomeTemplate,
      language: { code: idiomaCodigo },
      components: [
        {
          type: 'body',
          parameters: parametrosCorpo.map((texto) => ({ type: 'text', text: texto })),
        },
        ...payloadsBotoes.map((payload, index) => ({
          type: 'button',
          sub_type: 'quick_reply',
          index,
          parameters: [{ type: 'payload', payload }],
        })),
      ],
    },
  });

  return processarResposta(response);
}
