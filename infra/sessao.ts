import { createHmac, timingSafeEqual } from 'crypto';

const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export const NOME_COOKIE_SESSAO = 'sessao_admin';
export const DURACAO_COOKIE_SEGUNDOS = DURACAO_SESSAO_MS / 1000;

type PayloadSessao = {
  usuarioId: number;
  role: string;
  versaoToken: number;
  exp: number;
};

function segredo(): string {
  const valor = process.env.AUTH_SECRET;
  if (!valor) {
    throw new Error('AUTH_SECRET não configurado');
  }
  return valor;
}

function assinar(payloadBase64: string): string {
  return createHmac('sha256', segredo()).update(payloadBase64).digest('hex');
}

export function criarTokenSessao(usuarioId: number, role: string, versaoToken: number): string {
  const payload: PayloadSessao = {
    usuarioId,
    role,
    versaoToken,
    exp: Date.now() + DURACAO_SESSAO_MS,
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadBase64}.${assinar(payloadBase64)}`;
}

export function verificarTokenSessao(token: string | undefined | null): PayloadSessao | null {
  if (!token) return null;

  const [payloadBase64, assinatura] = token.split('.');
  if (!payloadBase64 || !assinatura) return null;

  const bufferRecebido = Buffer.from(assinatura, 'hex');
  const bufferEsperado = Buffer.from(assinar(payloadBase64), 'hex');
  if (bufferRecebido.length !== bufferEsperado.length) return null;
  if (!timingSafeEqual(bufferRecebido, bufferEsperado)) return null;

  let payload: PayloadSessao;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());
  } catch {
    return null;
  }

  if (payload.exp < Date.now()) return null;

  return payload;
}
