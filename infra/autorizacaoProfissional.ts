import { AppError } from '@/infra/errors';

type Sessao = {
  role: string;
  profissionalId: number | null;
};

export function resolverProfissionalAutorizado(
  sessao: Sessao,
  profissionalIdInformado: number | undefined,
  profissionalPadrao: number,
): number {
  if (sessao.role === 'gerente') {
    return profissionalIdInformado ?? profissionalPadrao;
  }

  if (sessao.profissionalId === null) {
    throw new AppError('Funcionário não está vinculado a um profissional');
  }

  if (profissionalIdInformado !== undefined && profissionalIdInformado !== sessao.profissionalId) {
    throw new AppError('Você não tem permissão para acessar esse profissional', 403);
  }

  return sessao.profissionalId;
}
