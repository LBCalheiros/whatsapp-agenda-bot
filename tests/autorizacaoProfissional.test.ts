import { AppError } from '@/infra/errors';
import { resolverProfissionalAutorizado } from '@/infra/autorizacaoProfissional';

describe('resolverProfissionalAutorizado', () => {
  it('gerente pode selecionar um profissional informado', () => {
    const profissionalId = resolverProfissionalAutorizado(
      {
        role: 'gerente',
        profissionalId: null,
      },
      7,
      1,
    );

    expect(profissionalId).toBe(7);
  });

  it('gerente usa o profissional padrão quando nenhum é informado', () => {
    const profissionalId = resolverProfissionalAutorizado(
      {
        role: 'gerente',
        profissionalId: null,
      },
      undefined,
      1,
    );

    expect(profissionalId).toBe(1);
  });

  it('funcionário usa o profissional ao qual está vinculado', () => {
    const profissionalId = resolverProfissionalAutorizado(
      {
        role: 'funcionario',
        profissionalId: 5,
      },
      undefined,
      1,
    );

    expect(profissionalId).toBe(5);
  });

  it('funcionário pode informar explicitamente o próprio profissional', () => {
    const profissionalId = resolverProfissionalAutorizado(
      {
        role: 'funcionario',
        profissionalId: 5,
      },
      5,
      1,
    );

    expect(profissionalId).toBe(5);
  });

  it('funcionário não pode acessar outro profissional', () => {
    expect(() =>
      resolverProfissionalAutorizado(
        {
          role: 'funcionario',
          profissionalId: 5,
        },
        7,
        1,
      ),
    ).toThrow(new AppError('Você não tem permissão para acessar esse profissional', 403));
  });

  it('funcionário sem vínculo não pode acessar disponibilidade', () => {
    expect(() =>
      resolverProfissionalAutorizado(
        {
          role: 'funcionario',
          profissionalId: null,
        },
        undefined,
        1,
      ),
    ).toThrow(new AppError('Funcionário não está vinculado a um profissional'));
  });
});
