import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { validar } from '@/infra/validacao';
import { criarAgendamento, listarAgendamentos } from '@/models/agendamento';
import { z } from 'zod';

const schemaCriarAgendamento = z.object({
  clienteId: z.number().int().positive(),
  profissionalId: z.number().int().positive(),
  servicoId: z.number().int().positive(),
  dataHora: z.coerce.date(),
});

export async function GET(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const profissionalId = searchParams.get('profissionalId');
    const data = searchParams.get('data');
    const status = searchParams.get('status');

    const agendamentos = await listarAgendamentos({
      profissionalId: profissionalId ? Number(profissionalId) : undefined,
      data: data ? new Date(data) : undefined,
      status: status ?? undefined,
    });

    return Response.json(agendamentos);
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
    const dados = validar(schemaCriarAgendamento, body);

    const agendamento = await criarAgendamento({
      clienteId: dados.clienteId,
      profissionalId: dados.profissionalId,
      servicoId: dados.servicoId,
      dataHora: dados.dataHora,
    });

    return Response.json(agendamento, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
