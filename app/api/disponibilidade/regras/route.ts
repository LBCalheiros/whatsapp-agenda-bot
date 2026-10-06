import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { resolverProfissionalAutorizado } from '@/infra/autorizacaoProfissional';
import { validar } from '@/infra/validacao';
import {
  listarRegras,
  obterProfissionalPadrao,
  upsertRegraDisponibilidade,
} from '@/models/disponibilidade';
import { z } from 'zod';

const schemaUpsertRegra = z.object({
  diaSemana: z.number().int().min(0).max(6),
  horarioInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Use o formato HH:mm'),
  horarioFim: z.string().regex(/^\d{2}:\d{2}$/, 'Use o formato HH:mm'),
  intervaloMinutos: z.number().int().positive(),
  profissionalId: z.number().int().positive().optional(),
});

export async function GET(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const profissionalIdParam = searchParams.get('profissionalId');

    const profissionalId = resolverProfissionalAutorizado(
      sessao,
      profissionalIdParam ? Number(profissionalIdParam) : undefined,
      await obterProfissionalPadrao(),
    );

    const regras = await listarRegras(profissionalId);
    return Response.json(regras);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const dados = validar(schemaUpsertRegra, body);

    const profissionalId = resolverProfissionalAutorizado(
      sessao,
      dados.profissionalId,
      await obterProfissionalPadrao(),
    );

    const regra = await upsertRegraDisponibilidade({
      profissionalId,
      diaSemana: dados.diaSemana,
      horarioInicio: dados.horarioInicio,
      horarioFim: dados.horarioFim,
      intervaloMinutos: dados.intervaloMinutos,
    });

    return Response.json(regra);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
