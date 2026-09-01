import { AppError } from 'infra/errors';
import { logger } from 'infra/logger';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    logger.error({ error }, 'Erro inesperado');

    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
