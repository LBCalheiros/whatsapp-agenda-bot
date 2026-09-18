import { NextResponse } from 'next/server';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { pool } from '@/infra/database';
import { enviarMensagemTexto } from '@/infra/whatsapp';
import { encerrarAtendimento } from '@/models/atendimento';
import { AppError } from '@/infra/errors';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const atendimento = await encerrarAtendimento(Number(id));

    const { rows } = await pool.query(`SELECT telefone FROM clientes WHERE id = $1`, [
      atendimento.cliente_id,
    ]);
    const telefone = rows[0]?.telefone;

    if (telefone) {
      await pool.query(
        `UPDATE conversas SET estado = 'menu', contexto = NULL, atualizado_em = now() WHERE telefone = $1`,
        [telefone],
      );
      await enviarMensagemTexto(
        telefone,
        'Atendimento encerrado. Digite qualquer mensagem pra ver o menu novamente.',
      );
    }

    return NextResponse.json(atendimento);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ erro: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
