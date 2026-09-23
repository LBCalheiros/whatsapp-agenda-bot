import { config } from 'dotenv';
config({ path: '.env.development' });

import { pool } from '../infra/database';
import { atualizarTelefoneNotificacao } from '../models/usuarioAdmin';

async function main() {
  const [, , email, telefone] = process.argv;

  if (!email) {
    console.error('Uso: npm run admin:number -- <email> [telefone]');
    console.error('Sem telefone: remove a notificação (seta null)');
    process.exit(1);
  }

  const usuario = await atualizarTelefoneNotificacao(email, telefone ?? null);
  console.log('Telefone de notificação atualizado:', usuario);
  await pool.end();
}

main().catch((error) => {
  console.error('Erro ao atualizar telefone:', error);
  process.exit(1);
});
