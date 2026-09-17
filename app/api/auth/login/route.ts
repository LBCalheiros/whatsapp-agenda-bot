import { NextResponse } from 'next/server';
import { autenticar } from '@/models/usuarioAdmin';
import { criarTokenSessao, NOME_COOKIE_SESSAO, DURACAO_COOKIE_SEGUNDOS } from '@/infra/sessao';
import { logger } from '@/infra/logger';

export async function POST(request: Request) {
  const body = await request.json();
  const { email, senha } = body;

  if (!email || !senha) {
    return NextResponse.json({ erro: 'Email e senha são obrigatórios' }, { status: 400 });
  }

  const usuario = await autenticar(email, senha);
  if (!usuario) {
    return NextResponse.json({ erro: 'Credenciais inválidas' }, { status: 401 });
  }

  const token = criarTokenSessao(usuario.id, usuario.role, usuario.versao_token);

  const response = NextResponse.json({ ok: true, email: usuario.email, role: usuario.role });
  response.cookies.set(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACAO_COOKIE_SEGUNDOS,
  });

  logger.info({ usuarioId: usuario.id }, 'Login realizado');

  return response;
}
