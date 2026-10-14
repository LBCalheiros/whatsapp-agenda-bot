// O preço gravado em cada agendamento é o que alimenta a receita, então só o gerente
// pode vê-lo. Esconder a aba de receita não basta: o preço também viajaria nas respostas
// de listagem e de edição, onde qualquer funcionário poderia ler e somar.
export function ocultarPrecoParaNaoGerente<T extends object>(item: T, ehGerente: boolean): T {
  if (ehGerente) return item;

  return Object.fromEntries(Object.entries(item).filter(([chave]) => chave !== 'preco')) as T;
}

export function ocultarPrecosParaNaoGerente<T extends object>(itens: T[], ehGerente: boolean): T[] {
  return itens.map((item) => ocultarPrecoParaNaoGerente(item, ehGerente));
}
