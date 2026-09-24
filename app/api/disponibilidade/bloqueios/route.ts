import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { validar } from '@/infra/validacao';
import { criarBloqueio, listarBloqueios, obterProfissionalPadrao } from '@/models/disponibilidade';
import { z } from 'zod';

const schemaCriarBloqueio = z.object({
  inicio: z.coerce.date(),
  fim: z.coerce.date(),
  motivo: z.string().optional(),
});

export async function GET() {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const profissionalId = await obterProfissionalPadrao();
    const bloqueios = await listarBloqueios(profissionalId);
    return Response.json(bloqueios);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const dados = validar(schemaCriarBloqueio, body);
    const profissionalId = await obterProfissionalPadrao();

    const bloqueio = await criarBloqueio({
      profissionalId,
      inicio: dados.inicio,
      fim: dados.fim,
      motivo: dados.motivo,
    });

    return Response.json(bloqueio, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
