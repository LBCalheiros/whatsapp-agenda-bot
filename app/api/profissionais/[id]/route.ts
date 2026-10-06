import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { validar } from '@/infra/validacao';
import {
  atualizarProfissional,
  buscarProfissionalPorId,
  definirAtivoProfissional,
  excluirProfissional,
  listarServicoIdsDoProfissional,
} from '@/models/profissional';
import { z } from 'zod';

const schemaPatchProfissional = z.object({
  nome: z.string().min(1).optional(),
  telefoneContato: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
  servicoIds: z.array(z.number().int().positive()).optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const idNumero = Number(id);
    const profissional = await buscarProfissionalPorId(idNumero);
    const servicoIds = await listarServicoIdsDoProfissional(idNumero);
    return Response.json({ ...profissional, servicoIds });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (sessao.role !== 'gerente') {
    return Response.json({ error: 'Só gerentes podem editar profissionais' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const idNumero = Number(id);
    const body = await request.json();
    const dados = validar(schemaPatchProfissional, body);

    let profissional = await atualizarProfissional(idNumero, {
      nome: dados.nome,
      telefoneContato: dados.telefoneContato,
      servicoIds: dados.servicoIds,
    });

    if (dados.ativo !== undefined) {
      profissional = await definirAtivoProfissional(idNumero, dados.ativo);
    }

    const servicoIds = await listarServicoIdsDoProfissional(idNumero);
    return Response.json({ ...profissional, servicoIds });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (sessao.role !== 'gerente') {
    return Response.json({ error: 'Só gerentes podem excluir profissionais' }, { status: 403 });
  }

  try {
    const { id } = await params;
    await excluirProfissional(Number(id));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
