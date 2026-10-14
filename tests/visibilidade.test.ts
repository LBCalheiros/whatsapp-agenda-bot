import { ocultarPrecoParaNaoGerente, ocultarPrecosParaNaoGerente } from '@/infra/visibilidade';

describe('infra/visibilidade', () => {
  const agendamento = { id: 1, status: 'completo', preco: '50.00', servico_nome: 'Corte' };

  it('mantém o preço para o gerente', () => {
    expect(ocultarPrecoParaNaoGerente(agendamento, true)).toEqual(agendamento);
  });

  it('remove o preço para quem não é gerente, sem alterar o objeto original', () => {
    const resultado = ocultarPrecoParaNaoGerente(agendamento, false);

    expect(resultado).toEqual({ id: 1, status: 'completo', servico_nome: 'Corte' });
    expect('preco' in resultado).toBe(false);
    expect(agendamento.preco).toBe('50.00');
  });

  it('remove o preço de todos os itens de uma lista', () => {
    const lista = [agendamento, { ...agendamento, id: 2, preco: null }];

    const resultado = ocultarPrecosParaNaoGerente(lista, false);

    expect(resultado.every((item) => !('preco' in item))).toBe(true);
    expect(ocultarPrecosParaNaoGerente(lista, true)).toEqual(lista);
  });
});
