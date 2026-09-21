import { config } from 'dotenv';
config({ path: '.env.development' });

import { pool } from '../infra/database';
import { redefinirSenha } from '../models/usuarioAdmin';

async function main() {
  const [, , email, novaSenha] = process.argv;

  if (!email || !novaSenha) {
    console.error('Uso: npm run admin:resetar-senha -- <email> <novaSenha>');
    process.exit(1);
  }

  const usuario = await redefinirSenha(email, novaSenha);
  console.log('Senha redefinida. Sessões antigas desse usuário foram invalidadas:', usuario);
  await pool.end();
}

main().catch((error) => {
  console.error('Erro ao redefinir senha:', error);
  process.exit(1);
});
