import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { validar } from '@/infra/validacao';
import {
  criarProfissional,
  listarProfissionaisAtivos,
  listarTodosProfissionais,
} from '@/models/profissional';
import { z } from 'zod';

const schemaCriarProfissional = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  telefoneContato: z.string().nullable().optional(),
  servicoIds: z.array(z.number().int().positive()).optional(),
});

export async function GET(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const incluirInativos = searchParams.get('incluirInativos') === 'true';

    const profissionais = incluirInativos
      ? await listarTodosProfissionais()
      : await listarProfissionaisAtivos();
    return Response.json(profissionais);
  } catch (error) {
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (sessao.role !== 'gerente') {
    return Response.json({ error: 'Só gerentes podem criar profissionais' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const dados = validar(schemaCriarProfissional, body);

    const profissional = await criarProfissional({
      nome: dados.nome,
      telefoneContato: dados.telefoneContato,
      servicoIds: dados.servicoIds,
    });

    return Response.json(profissional, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
