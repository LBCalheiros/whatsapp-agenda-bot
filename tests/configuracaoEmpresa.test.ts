import { pool } from '@/infra/database';
import {
  atualizarConfiguracaoEmpresa,
  obterConfiguracaoEmpresa,
} from '@/models/configuracaoEmpresa';

describe('models/configuracaoEmpresa (integração)', () => {
  let original: Record<string, unknown> | undefined;

  beforeAll(async () => {
    const { rows } = await pool.query(`SELECT * FROM configuracoes_empresa WHERE id = 1`);
    original = rows[0];
  });

  afterAll(async () => {
    // devolve a linha ao estado em que estava antes dos testes
    if (original) {
      await pool.query(
        `UPDATE configuracoes_empresa
         SET nome = $1, telefone = $2, endereco = $3, mensagem_inicial = $4,
             mensagem_confirmacao = $5, mensagem_encerramento = $6
         WHERE id = 1`,
        [
          original.nome,
          original.telefone,
          original.endereco,
          original.mensagem_inicial,
          original.mensagem_confirmacao,
          original.mensagem_encerramento,
        ],
      );
    }

    await pool.end();
  });

  it('atualiza só os campos enviados e mantém os demais', async () => {
    await atualizarConfiguracaoEmpresa({ nome: 'Empresa Jest', endereco: 'Rua Jest, 1' });
    const resultado = await atualizarConfiguracaoEmpresa({ telefone: '5511900000099' });

    expect(resultado.nome).toBe('Empresa Jest');
    expect(resultado.endereco).toBe('Rua Jest, 1');
    expect(resultado.telefone).toBe('5511900000099');
  });

  it('remove espaços nas pontas e converte texto vazio em null', async () => {
    await atualizarConfiguracaoEmpresa({ mensagem_inicial: '  Olá, bem-vindo!  ' });
    const comEspacos = await obterConfiguracaoEmpresa();
    expect(comEspacos.mensagem_inicial).toBe('Olá, bem-vindo!');

    const vazio = await atualizarConfiguracaoEmpresa({ mensagem_inicial: '   ' });
    expect(vazio.mensagem_inicial).toBeNull();
  });

  it('permite limpar um campo com null sem mexer nos outros', async () => {
    await atualizarConfiguracaoEmpresa({
      mensagem_confirmacao: 'Chegue 5 minutos antes.',
      mensagem_encerramento: 'Obrigado!',
    });

    const resultado = await atualizarConfiguracaoEmpresa({ mensagem_confirmacao: null });

    expect(resultado.mensagem_confirmacao).toBeNull();
    expect(resultado.mensagem_encerramento).toBe('Obrigado!');
  });

  it('sem campos para atualizar devolve a configuração atual', async () => {
    const antes = await obterConfiguracaoEmpresa();
    const depois = await atualizarConfiguracaoEmpresa({});

    expect(depois).toEqual(antes);
  });
});
