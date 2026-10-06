// scripts/proximo-slot-servico.ts
import { config } from 'dotenv';
config({ path: '.env.development' });

import { pool } from '../infra/database';
import { consultarHorariosDisponiveisParaServico } from '../models/disponibilidade';

const DIAS_BUSCA = 7;

async function main() {
  const { rows: servicos } = await pool.query(
    `SELECT id, nome, duracao_minutos FROM servicos WHERE ativo = true ORDER BY nome`,
  );

  if (servicos.length === 0) {
    console.log('Nenhum serviço ativo.');
    await pool.end();
    return;
  }

  console.log('Serviços ativos:', servicos.map((s) => `${s.id}=${s.nome}`).join(', '));

  const alvo = servicos[0];
  console.log('servicoId usado:', alvo.id, '-', alvo.nome);

  let encontrado: Date | null = null;
  for (let i = 0; i < DIAS_BUSCA && !encontrado; i++) {
    const dia = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    const horarios = await consultarHorariosDisponiveisParaServico(
      alvo.id,
      dia,
      alvo.duracao_minutos,
    );
    const valido = horarios.find((h) => h.getTime() - Date.now() >= 5 * 60 * 1000);
    if (valido) encontrado = valido;
  }

  console.log(
    'próximo slot:',
    encontrado?.toISOString() ?? 'NENHUM nos próximos ' + DIAS_BUSCA + ' dias',
  );
  console.log('precisa escolher serviço no bot?', servicos.length > 1 ? 'SIM' : 'não');

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
