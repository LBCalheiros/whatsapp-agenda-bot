import { z } from 'zod';
import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { validar } from '@/infra/validacao';
import {
  LIMITES_CONFIGURACAO,
  atualizarConfiguracaoEmpresa,
  obterConfiguracaoEmpresa,
} from '@/models/configuracaoEmpresa';

function texto(limite: number) {
  return z.string().max(limite, `No máximo ${limite} caracteres`).nullable().optional();
}

const schemaAtualizarConfiguracao = z.object({
  nome: texto(LIMITES_CONFIGURACAO.nome),
  telefone: texto(LIMITES_CONFIGURACAO.telefone),
  endereco: texto(LIMITES_CONFIGURACAO.endereco),
  mensagem_inicial: texto(LIMITES_CONFIGURACAO.mensagem_inicial),
  mensagem_confirmacao: texto(LIMITES_CONFIGURACAO.mensagem_confirmacao),
  mensagem_encerramento: texto(LIMITES_CONFIGURACAO.mensagem_encerramento),
});

export async function GET() {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    return Response.json(await obterConfiguracaoEmpresa());
  } catch (error) {
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
    return Response.json({ error: 'Só gerentes podem alterar as configurações' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const dados = validar(schemaAtualizarConfiguracao, body);

    return Response.json(await atualizarConfiguracaoEmpresa(dados));
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
