import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { validar } from '@/infra/validacao';
import { atualizarServico, definirAtivoServico, excluirServico } from '@/models/servico';
import { z } from 'zod';

const schemaPatchServico = z.object({
  nome: z.string().min(1).optional(),
  duracaoMinutos: z.number().int().positive().optional(),
  preco: z.number().nonnegative().nullable().optional(),
  ativo: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (sessao.role !== 'gerente') {
    return Response.json({ error: 'Só gerentes podem editar serviços' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const idNumero = Number(id);
    const body = await request.json();
    const dados = validar(schemaPatchServico, body);

    let servico = await atualizarServico(idNumero, {
      nome: dados.nome,
      duracaoMinutos: dados.duracaoMinutos,
      preco: dados.preco,
    });

    if (dados.ativo !== undefined) {
      servico = await definirAtivoServico(idNumero, dados.ativo);
    }

    return Response.json(servico);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (sessao.role !== 'gerente') {
    return Response.json({ error: 'Só gerentes podem excluir serviços' }, { status: 403 });
  }

  try {
    const { id } = await params;
    await excluirServico(Number(id));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
