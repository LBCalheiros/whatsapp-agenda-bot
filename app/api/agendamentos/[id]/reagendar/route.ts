import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { reagendarAgendamento } from '@/models/agendamento';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    await reagendarAgendamento(Number(id), new Date(body.novaDataHora));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
