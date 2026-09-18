import { NextResponse } from 'next/server';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { assumirAtendimento } from '@/models/atendimento';
import { AppError } from '@/infra/errors';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const atendimento = await assumirAtendimento(Number(id), sessao.usuarioId);
    return NextResponse.json(atendimento);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ erro: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
