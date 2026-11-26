import { pool } from '@/infra/database';
import { AppError } from '@/infra/errors';
import { normalizarTelefone, variantesDoTelefone } from '@/infra/telefone';

export type Cliente = {
  id: number;
  telefone: string;
  nome: string | null;
  criado_em: string;
};

// Procura pelo número exato primeiro e, se não achar, pela outra grafia do celular
// brasileiro (com/sem o 9º dígito); só cria se nenhuma existir.
export async function buscarOuCriarClientePorTelefone(telefone: string): Promise<Cliente> {
  const variantes = variantesDoTelefone(telefone);

  const { rows } = await pool.query(
    `SELECT * FROM clientes
     WHERE telefone = ANY($1::text[])
     ORDER BY (telefone = $2) DESC, id
     LIMIT 1`,
    [variantes, telefone],
  );

  if (rows.length > 0) {
    return rows[0] as Cliente;
  }

  const { rows: criados } = await pool.query(
    `INSERT INTO clientes (telefone) VALUES ($1)
     ON CONFLICT (telefone) DO NOTHING
     RETURNING *`,
    [telefone],
  );

  if (criados.length > 0) {
    return criados[0] as Cliente;
  }

  // outra requisição criou o mesmo telefone entre o SELECT e o INSERT
  const { rows: existentes } = await pool.query(`SELECT * FROM clientes WHERE telefone = $1`, [
    telefone,
  ]);
  return existentes[0] as Cliente;
}

// Cliente informado no painel: o telefone é normalizado para o formato do WhatsApp e o
// nome só é gravado se o cliente ainda não tiver um (nunca sobrescreve).
export async function buscarOuCriarClienteManual(
  telefoneDigitado: string,
  nome?: string | null,
): Promise<Cliente> {
  const telefone = normalizarTelefone(telefoneDigitado);

  if (!telefone) {
    throw new AppError('Telefone inválido. Use DDD + número, por exemplo (11) 99999-9999');
  }

  const cliente = await buscarOuCriarClientePorTelefone(telefone);
  const nomeLimpo = nome?.trim();

  if (nomeLimpo && !cliente.nome) {
    return atualizarNomeCliente(cliente.id, nomeLimpo);
  }

  return cliente;
}

export async function atualizarNomeCliente(id: number, nome: string): Promise<Cliente> {
  const { rows } = await pool.query(`UPDATE clientes SET nome = $1 WHERE id = $2 RETURNING *`, [
    nome,
    id,
  ]);
  if (rows.length === 0) {
    throw new AppError('Cliente não encontrado', 404);
  }
  return rows[0] as Cliente;
}
