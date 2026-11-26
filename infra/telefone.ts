// Formato único de telefone do sistema: só dígitos, com DDI, igual ao `from` que a Meta
// manda no webhook (ex.: 5511999999999). É o que `clientes.telefone` guarda e o que o
// bot usa para achar o cliente, então qualquer telefone digitado no painel passa por aqui.
// Sem imports de servidor: a tela também usa para mostrar como o número será salvo.

const REGEX_BRASIL = /^55[1-9][1-9](9\d{8}|[2-9]\d{7})$/;

export function normalizarTelefone(entrada: string): string | null {
  const temMais = entrada.trim().startsWith('+');
  let digitos = entrada.replace(/\D/g, '');

  if (digitos.startsWith('00')) {
    digitos = digitos.slice(2);
  }

  // sem DDI (e sem "+"): DDD + número, assume Brasil
  if (!temMais && (digitos.length === 10 || digitos.length === 11)) {
    digitos = `55${digitos}`;
  }

  if (digitos.startsWith('55')) {
    return REGEX_BRASIL.test(digitos) ? digitos : null;
  }

  // outros países: E.164 vai de 8 a 15 dígitos
  return digitos.length >= 11 && digitos.length <= 15 ? digitos : null;
}

// Celular brasileiro pode chegar com ou sem o 9º dígito (a Meta já mandou o número sem o 9
// no webhook de contas antigas). Devolve o número e, se for celular do Brasil, a outra
// grafia, para o mesmo cliente não virar dois cadastros.
export function variantesDoTelefone(telefone: string): string[] {
  if (/^55[1-9][1-9]9\d{8}$/.test(telefone)) {
    return [telefone, telefone.slice(0, 4) + telefone.slice(5)];
  }

  if (/^55[1-9][1-9][6-9]\d{7}$/.test(telefone)) {
    return [telefone, `${telefone.slice(0, 4)}9${telefone.slice(4)}`];
  }

  return [telefone];
}
