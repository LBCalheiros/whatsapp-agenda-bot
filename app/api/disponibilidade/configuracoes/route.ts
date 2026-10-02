import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { validar } from '@/infra/validacao';
import { obterProfissionalPadrao } from '@/models/disponibilidade';
import { atualizarAntecedenciaMinima, buscarAntecedenciaMinima } from '@/models/profissional';
import { z } from 'zod';

const schemaAntecedencia = z.object({
  antecedenciaMinimaHoras: z.number().int().min(0),
});

export async function GET() {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const profissionalId = await obterProfissionalPadrao();
    const antecedenciaMinimaHoras = await buscarAntecedenciaMinima(profissionalId);
    return Response.json({ antecedenciaMinimaHoras });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (sessao.role !== 'gerente') {
    return Response.json({ error: 'Só gerentes podem alterar essa configuração' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const dados = validar(schemaAntecedencia, body);
    const profissionalId = await obterProfissionalPadrao();
    const antecedenciaMinimaHoras = await atualizarAntecedenciaMinima(
      profissionalId,
      dados.antecedenciaMinimaHoras,
    );
    return Response.json({ antecedenciaMinimaHoras });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
