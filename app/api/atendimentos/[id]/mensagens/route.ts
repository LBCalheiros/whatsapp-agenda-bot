import { NextResponse } from 'next/server';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { pool } from '@/infra/database';
import { enviarMensagemTexto } from '@/infra/whatsapp';
import { listarMensagens, registrarMensagem, buscarAtendimentoPorId } from '@/models/atendimento';
import { AppError } from '@/infra/errors';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  }

  const { id } = await params;
  const mensagens = await listarMensagens(Number(id));
  return NextResponse.json(mensagens);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  }

  const { id } = await params;
  const atendimentoId = Number(id);
  const body = await request.json();
  const { texto } = body;

  if (!texto) {
    return NextResponse.json({ erro: 'Texto é obrigatório' }, { status: 400 });
  }

  try {
    const atendimento = await buscarAtendimentoPorId(atendimentoId);

    if (atendimento.status === 'encerrado') {
      throw new AppError('Esse atendimento já foi encerrado');
    }

    const { rows } = await pool.query(`SELECT telefone FROM clientes WHERE id = $1`, [
      atendimento.cliente_id,
    ]);
    const telefoneCliente = rows[0]?.telefone;

    if (!telefoneCliente) {
      throw new AppError('Cliente do atendimento não encontrado', 404);
    }

    const mensagem = await registrarMensagem(atendimentoId, 'funcionario', texto);
    await enviarMensagemTexto(telefoneCliente, texto);

    return NextResponse.json(mensagem);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ erro: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
