import { ZodType } from 'zod';
import { AppError } from '@/infra/errors';

export function validar<T>(schema: ZodType<T>, dado: unknown): T {
  const resultado = schema.safeParse(dado);
  if (!resultado.success) {
    const mensagem = resultado.error.issues
      .map((problema) => `${problema.path.join('.') || 'corpo'}: ${problema.message}`)
      .join('; ');
    throw new AppError(mensagem || 'Dados inválidos', 400);
  }
  return resultado.data;
}
