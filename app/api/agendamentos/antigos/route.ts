import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import {
  DIAS_HISTORICO,
  contarAgendamentosAntigos,
  limparAgendamentosAntigos,
} from '@/models/agendamento';

// prévia do que a limpeza apagaria, pra tela confirmar com o número exato
export async function GET() {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (sessao.role !== 'gerente') {
    return Response.json({ error: 'Só gerentes podem limpar agendamentos' }, { status: 403 });
  }

  try {
    const { total } = await contarAgendamentosAntigos();
    return Response.json({ total, dias: DIAS_HISTORICO });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE() {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (sessao.role !== 'gerente') {
    return Response.json({ error: 'Só gerentes podem limpar agendamentos' }, { status: 403 });
  }

  try {
    const { removidos } = await limparAgendamentosAntigos();
    logger.info({ removidos, usuarioId: sessao.usuarioId }, 'Limpeza de agendamentos antigos');
    return Response.json({ removidos, dias: DIAS_HISTORICO });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
