import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const TAMANHO_CHAVE = 64;

export function gerarHashSenha(senha: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(senha, salt, TAMANHO_CHAVE).toString('hex');
  return `${salt}:${hash}`;
}

export function verificarSenha(senha: string, hashArmazenado: string): boolean {
  const [salt, hashHex] = hashArmazenado.split(':');
  if (!salt || !hashHex) return false;

  const hashCalculado = scryptSync(senha, salt, TAMANHO_CHAVE);
  const hashArmazenadoBuffer = Buffer.from(hashHex, 'hex');

  if (hashCalculado.length !== hashArmazenadoBuffer.length) return false;
  return timingSafeEqual(hashCalculado, hashArmazenadoBuffer);
}
