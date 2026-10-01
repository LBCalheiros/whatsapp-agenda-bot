import { AppError } from '@/infra/errors';
import { logger } from '@/infra/logger';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { validar } from '@/infra/validacao';
import { criarUsuarioAdmin, listarFuncionarios } from '@/models/usuarioAdmin';
import { z } from 'zod';

const schemaCriarFuncionario = z.object({
  email: z.string().email(),
  senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres'),
  telefoneNotificacao: z.string().nullable().optional(),
  role: z.enum(['gerente', 'funcionario']).default('funcionario'),
  profissionalId: z.number().int().positive().nullable().optional(),
});

export async function GET() {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (sessao.role !== 'gerente') {
    return Response.json({ error: 'Só gerentes podem listar funcionários' }, { status: 403 });
  }

  try {
    const funcionarios = await listarFuncionarios();
    return Response.json(funcionarios);
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
  if (sessao.role !== 'gerente') {
    return Response.json({ error: 'Só gerentes podem criar funcionários' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const dados = validar(schemaCriarFuncionario, body);

    const funcionario = await criarUsuarioAdmin(
      dados.email,
      dados.senha,
      dados.telefoneNotificacao ?? null,
      dados.role,
      dados.profissionalId ?? null,
    );

    return Response.json(funcionario, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Erro inesperado');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
