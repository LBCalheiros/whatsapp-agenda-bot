import { NextResponse } from 'next/server';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { pool } from '@/infra/database';

export async function GET() {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  }

  const { rows } = await pool.query(`SELECT id, email, role FROM usuarios_admin WHERE id = $1`, [
    sessao.usuarioId,
  ]);

  if (rows.length === 0) {
    return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  }

  return NextResponse.json({ id: rows[0].id, email: rows[0].email, role: rows[0].role });
}
