import { NextResponse } from 'next/server';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { invalidarSessoes } from '@/models/usuarioAdmin';
import { NOME_COOKIE_SESSAO } from '@/infra/sessao';

export async function POST() {
  const sessao = await obterSessaoAtual();

  if (sessao) {
    // invalida no servidor todo token emitido antes disso pra esse usuário,
    // não só o cookie deste navegador
    await invalidarSessoes(sessao.usuarioId);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(NOME_COOKIE_SESSAO, '', { path: '/', maxAge: 0 });
  return response;
}
