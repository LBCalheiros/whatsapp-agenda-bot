import { NextResponse } from 'next/server';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { atualizarNomeCliente } from '@/models/cliente';
import { AppError } from '@/infra/errors';
import { validar } from '@/infra/validacao';
import { z } from 'zod';

const schemaAtualizarNome = z.object({
  nome: z.string().trim().min(1),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  try {
    const { nome } = validar(schemaAtualizarNome, body);
    const cliente = await atualizarNomeCliente(Number(id), nome);
    return NextResponse.json(cliente);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ erro: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
