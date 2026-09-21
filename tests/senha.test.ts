import { gerarHashSenha, verificarSenha } from '@/infra/senha';

describe('senha', () => {
  it('reconhece a senha certa', () => {
    const hash = gerarHashSenha('minhaSenha123');
    expect(verificarSenha('minhaSenha123', hash)).toBe(true);
  });

  it('rejeita senha errada', () => {
    const hash = gerarHashSenha('minhaSenha123');
    expect(verificarSenha('outraSenha', hash)).toBe(false);
  });

  it('gera hashes diferentes pra mesma senha (salt aleatório)', () => {
    const hash1 = gerarHashSenha('minhaSenha123');
    const hash2 = gerarHashSenha('minhaSenha123');
    expect(hash1).not.toBe(hash2);
  });

  it('rejeita hash malformado sem quebrar', () => {
    expect(verificarSenha('qualquer', 'hashsemseparador')).toBe(false);
  });
});
