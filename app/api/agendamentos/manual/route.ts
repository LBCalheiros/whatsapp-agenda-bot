import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { ocultarPrecoParaNaoGerente } from '@/infra/visibilidade';
import { validar } from '@/infra/validacao';
import { criarAgendamentoManual } from '@/models/agendamento';
import { z } from 'zod';

const schemaCriarAgendamentoManual = z.object({
  telefone: z.string().trim().min(1, 'Telefone é obrigatório'),
  nomeCliente: z.string().trim().max(100).nullable().optional(),
  profissionalId: z.number().int().positive(),
  servicoId: z.number().int().positive(),
  dataHora: z.coerce.date(),
  observacoes: z.string().max(1000).nullable().optional(),
});

// Gerentes e funcionários podem criar; não passa pelas regras de disponibilidade do bot.
export async function POST(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const dados = validar(schemaCriarAgendamentoManual, body);

    const agendamento = await criarAgendamentoManual(dados);

    return Response.json(ocultarPrecoParaNaoGerente(agendamento, sessao.role === 'gerente'), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
