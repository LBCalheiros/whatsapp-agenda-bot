import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { criarAgendamento, listarAgendamentos } from '@/models/agendamento';

export async function GET(request: Request) {
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
  try {
    const body = await request.json();

    const agendamento = await criarAgendamento({
      clienteId: body.clienteId,
      profissionalId: body.profissionalId,
      servicoId: body.servicoId,
      dataHora: new Date(body.dataHora),
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
