import { z } from 'zod';
import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { validar } from '@/infra/validacao';
import { alterarServicoDoAgendamento } from '@/models/agendamento';

const schemaAlterarServico = z.object({
  servicoId: z.number().int().positive(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { servicoId } = validar(schemaAlterarServico, body);

    const agendamento = await alterarServicoDoAgendamento(Number(id), servicoId);
    return Response.json(agendamento);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
