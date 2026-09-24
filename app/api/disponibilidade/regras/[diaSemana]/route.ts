import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { obterProfissionalPadrao, removerRegraDisponibilidade } from '@/models/disponibilidade';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ diaSemana: string }> },
) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const { diaSemana } = await params;
    const profissionalId = await obterProfissionalPadrao();
    await removerRegraDisponibilidade(profissionalId, Number(diaSemana));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
