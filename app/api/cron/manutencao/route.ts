import { logger } from '@/infra/logger';
import { concluirAgendamentosPassados } from '@/models/agendamento';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Forbidden', { status: 401 });
  }

  try {
    const concluidos = await concluirAgendamentosPassados();

    logger.info({ concluidos }, 'Cron de manutenção de agendamentos concluído');

    return Response.json({ ok: true, concluidos });
  } catch (error) {
    logger.error({ error }, 'Falha no cron de manutenção de agendamentos');
    return Response.json({ ok: false }, { status: 500 });
  }
}
