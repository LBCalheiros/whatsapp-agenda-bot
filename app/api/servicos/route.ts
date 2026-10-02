import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { validar } from '@/infra/validacao';
import { criarServico, listarServicosAtivos, listarTodosServicos } from '@/models/servico';
import { z } from 'zod';

const schemaCriarServico = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  duracaoMinutos: z.number().int().positive(),
  preco: z.number().nonnegative().nullable().optional(),
});

export async function GET(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const incluirInativos = searchParams.get('incluirInativos') === 'true';

    // comportamento padrão inalterado desde o #27 (só ativos) — a tela de
    // gestão de serviços é quem pede explicitamente os inativos também
    const servicos = incluirInativos ? await listarTodosServicos() : await listarServicosAtivos();
    return Response.json(servicos);
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
    return Response.json({ error: 'Só gerentes podem criar serviços' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const dados = validar(schemaCriarServico, body);

    const servico = await criarServico({
      nome: dados.nome,
      duracaoMinutos: dados.duracaoMinutos,
      preco: dados.preco,
    });

    return Response.json(servico, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
