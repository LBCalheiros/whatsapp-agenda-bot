import { NextResponse } from 'next/server';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { atualizarNomeCliente } from '@/models/cliente';
import { AppError } from '@/infra/errors';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { nome } = body;

  if (!nome || typeof nome !== 'string' || !nome.trim()) {
    return NextResponse.json({ erro: 'Nome é obrigatório' }, { status: 400 });
  }

  try {
    const cliente = await atualizarNomeCliente(Number(id), nome.trim());
    return NextResponse.json(cliente);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ erro: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
