import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { validar } from '@/infra/validacao';
import { criarDataBRT } from '@/infra/data';
import { calcularReceita } from '@/models/agendamento';
import { z } from 'zod';

function schemaData() {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato YYYY-MM-DD')
    .transform((valor, contexto) => {
      try {
        return criarDataBRT(valor);
      } catch {
        contexto.addIssue({ code: 'custom', message: 'Data inválida' });
        return z.NEVER;
      }
    })
    .optional();
}

const schemaReceita = z.object({
  dataInicio: schemaData(),
  dataFim: schemaData(),
});

export async function GET(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (sessao.role !== 'gerente') {
    return Response.json({ error: 'Só gerentes podem ver a receita' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dados = validar(schemaReceita, Object.fromEntries(searchParams.entries()));

    const receita = await calcularReceita({
      dataInicio: dados.dataInicio,
      dataFim: dados.dataFim,
    });

    return Response.json(receita);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
