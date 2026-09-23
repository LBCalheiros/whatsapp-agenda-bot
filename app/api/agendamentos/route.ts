import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { validar } from '@/infra/validacao';
import { criarDataBRT } from '@/infra/data';
import { criarAgendamento, listarAgendamentos } from '@/models/agendamento';
import { z } from 'zod';

const STATUS_AGENDAMENTO = [
  'agendado',
  'confirmado',
  'cancelado',
  'completo',
  'nao_compareceu',
] as const;

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

const schemaListarAgendamentos = z.object({
  profissionalId: z.coerce.number().int().positive().optional(),
  servicoId: z.coerce.number().int().positive().optional(),
  buscaCliente: z.string().min(1).optional(),
  dataInicio: schemaData(),
  dataFim: schemaData(),
  status: z.enum(STATUS_AGENDAMENTO).optional(),
});

const schemaCriarAgendamento = z.object({
  clienteId: z.number().int().positive(),
  profissionalId: z.number().int().positive(),
  servicoId: z.number().int().positive(),
  dataHora: z.coerce.date(),
});

export async function GET(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dados = validar(schemaListarAgendamentos, Object.fromEntries(searchParams.entries()));

    const agendamentos = await listarAgendamentos({
      profissionalId: dados.profissionalId,
      servicoId: dados.servicoId,
      buscaCliente: dados.buscaCliente,
      dataInicio: dados.dataInicio,
      dataFim: dados.dataFim,
      status: dados.status,
    });

    return Response.json(agendamentos);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const dados = validar(schemaCriarAgendamento, body);

    const agendamento = await criarAgendamento({
      clienteId: dados.clienteId,
      profissionalId: dados.profissionalId,
      servicoId: dados.servicoId,
      dataHora: dados.dataHora,
    });

    return Response.json(agendamento, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
