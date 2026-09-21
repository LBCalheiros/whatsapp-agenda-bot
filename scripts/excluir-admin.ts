import { config } from 'dotenv';
config({ path: '.env.development' });

import { pool } from '../infra/database';
import { excluirUsuarioAdmin } from '../models/usuarioAdmin';

async function main() {
  const [, , email] = process.argv;
  if (!email) {
    console.error('Uso: npm run admin:excluir -- <email>');
    process.exit(1);
  }
  await excluirUsuarioAdmin(email);
  console.log('Usuário excluído:', email);
  await pool.end();
}

main().catch((error) => {
  console.error('Erro ao excluir usuário:', error);
  process.exit(1);
});
