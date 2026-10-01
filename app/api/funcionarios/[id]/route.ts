import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { validar } from '@/infra/validacao';
import {
  atualizarFuncionarioComoGerente,
  atualizarPerfilProprio,
  buscarFuncionarioPorId,
  definirAtivo,
  excluirFuncionarioPorId,
} from '@/models/usuarioAdmin';
import { z } from 'zod';

const schemaPatchProprio = z.object({
  email: z.string().email().optional(),
  telefoneNotificacao: z.string().nullable().optional(),
  novaSenha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres').optional(),
});

const schemaPatchGerente = schemaPatchProprio.extend({
  role: z.enum(['gerente', 'funcionario']).optional(),
  profissionalId: z.number().int().positive().nullable().optional(),
  ativo: z.boolean().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { id } = await params;
  const idAlvo = Number(id);

  if (sessao.role !== 'gerente' && sessao.usuarioId !== idAlvo) {
    return Response.json({ error: 'Sem permissão pra ver esse funcionário' }, { status: 403 });
  }

  try {
    const funcionario = await buscarFuncionarioPorId(idAlvo);
    return Response.json(funcionario);
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

  const { id } = await params;
  const idAlvo = Number(id);
  const ehVocêMesmo = sessao.usuarioId === idAlvo;

  if (sessao.role !== 'gerente' && !ehVocêMesmo) {
    return Response.json({ error: 'Sem permissão pra editar esse funcionário' }, { status: 403 });
  }

  try {
    const body = await request.json();

    // gerente editando alguém (inclusive a si mesmo) pode mexer em papel/vínculo/ativo;
    // funcionário comum editando a si mesmo só mexe nos próprios dados de contato
    if (sessao.role === 'gerente') {
      const dados = validar(schemaPatchGerente, body);
      let funcionario = await atualizarFuncionarioComoGerente(idAlvo, sessao.usuarioId, {
        email: dados.email,
        telefoneNotificacao: dados.telefoneNotificacao,
        novaSenha: dados.novaSenha,
        role: dados.role,
        profissionalId: dados.profissionalId,
      });

      if (dados.ativo !== undefined) {
        funcionario = await definirAtivo(idAlvo, sessao.usuarioId, dados.ativo);
      }

      return Response.json(funcionario);
    }

    const dados = validar(schemaPatchProprio, body);
    const funcionario = await atualizarPerfilProprio(idAlvo, {
      email: dados.email,
      telefoneNotificacao: dados.telefoneNotificacao,
      novaSenha: dados.novaSenha,
    });
    return Response.json(funcionario);
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
    return Response.json({ error: 'Só gerentes podem excluir funcionários' }, { status: 403 });
  }

  try {
    const { id } = await params;
    await excluirFuncionarioPorId(Number(id), sessao.usuarioId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
