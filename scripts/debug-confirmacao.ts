// scripts/debug-confirmacao.ts
import { config } from 'dotenv';
config({ path: '.env.development' });

import { pool } from '../infra/database';
import { obterProfissionalDisponivel } from '../models/disponibilidade';
import { criarAgendamento } from '../models/agendamento';
import { buscarOuCriarClientePorTelefone } from '../models/cliente';

async function main() {
  const servicoId = 4; // alterar de acordo com o ID
  const dataHora = new Date('2050-10-06T14:00:00.000Z');

  const { rows: servicos } = await pool.query(
    `SELECT duracao_minutos FROM servicos WHERE id = $1`,
    [servicoId],
  );
  const duracaoMinutos = servicos[0].duracao_minutos;
  console.log('duracaoMinutos:', duracaoMinutos);

  try {
    const profissionalId = await obterProfissionalDisponivel(servicoId, dataHora, duracaoMinutos);
    console.log('profissionalId resolvido:', profissionalId);

    const cliente = await buscarOuCriarClientePorTelefone('5511963653931');
    const agendamento = await criarAgendamento({
      clienteId: cliente.id,
      profissionalId,
      servicoId,
      dataHora,
    });
    console.log('agendamento criado:', agendamento);
  } catch (error) {
    console.error('ERRO:', error);
  }

  await pool.end();
}

main();
