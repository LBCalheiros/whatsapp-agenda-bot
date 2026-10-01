import { cookies } from 'next/headers';
import { pool } from '@/infra/database';
import { NOME_COOKIE_SESSAO, verificarTokenSessao } from '@/infra/sessao';

export async function obterSessaoAtual() {
  const cookieStore = await cookies();
  const token = cookieStore.get(NOME_COOKIE_SESSAO)?.value;

  const payload = verificarTokenSessao(token);
  if (!payload) return null;

  // confere se o token ainda é a versão vigente pro usuário — logout, troca de senha,
  // mudança de papel ou desativação incrementam `versao_token`, o que derruba na
  // hora qualquer token emitido antes, mesmo que a assinatura ainda esteja válida
  const { rows } = await pool.query(
    `SELECT versao_token, ativo FROM usuarios_admin WHERE id = $1`,
    [payload.usuarioId],
  );

  if (rows.length === 0 || rows[0].versao_token !== payload.versaoToken || !rows[0].ativo) {
    return null;
  }

  return payload;
}
