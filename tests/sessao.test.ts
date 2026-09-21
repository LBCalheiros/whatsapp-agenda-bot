import { criarTokenSessao, verificarTokenSessao } from '@/infra/sessao';

describe('sessao', () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = 'segredo-de-teste';
  });

  it('cria e verifica um token válido', () => {
    const token = criarTokenSessao(1, 'admin', 0);
    const payload = verificarTokenSessao(token);
    expect(payload).toEqual({
      usuarioId: 1,
      role: 'admin',
      versaoToken: 0,
      exp: expect.any(Number),
    });
  });

  it('rejeita token adulterado', () => {
    const token = criarTokenSessao(1, 'admin', 0);
    const adulterado = token.slice(0, -2) + 'zz';
    expect(verificarTokenSessao(adulterado)).toBeNull();
  });

  it('rejeita token expirado', () => {
    const originalNow = Date.now;
    Date.now = () => originalNow() - 8 * 24 * 60 * 60 * 1000;
    const tokenAntigo = criarTokenSessao(1, 'admin', 0);
    Date.now = originalNow;

    expect(verificarTokenSessao(tokenAntigo)).toBeNull();
  });

  it('rejeita token vazio/nulo', () => {
    expect(verificarTokenSessao(null)).toBeNull();
    expect(verificarTokenSessao(undefined)).toBeNull();
    expect(verificarTokenSessao('')).toBeNull();
  });
});
