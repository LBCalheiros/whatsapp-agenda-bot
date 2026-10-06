import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { resolverProfissionalAutorizado } from '@/infra/autorizacaoProfissional';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { obterProfissionalPadrao, removerBloqueio } from '@/models/disponibilidade';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const profissionalIdParam = searchParams.get('profissionalId');

    const profissionalId = resolverProfissionalAutorizado(
      sessao,
      profissionalIdParam ? Number(profissionalIdParam) : undefined,
      await obterProfissionalPadrao(),
    );

    await removerBloqueio(Number(id), profissionalId);

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
