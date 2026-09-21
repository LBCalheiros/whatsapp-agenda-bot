import { config } from 'dotenv';
config({ path: '.env.development' });

import { pool } from '../infra/database';
import { criarUsuarioAdmin } from '../models/usuarioAdmin';

async function main() {
  const [, , email, senha, telefone] = process.argv;

  if (!email || !senha) {
    console.error('Uso: npm run admin:criar -- <email> <senha> [telefone_notificacao]');
    process.exit(1);
  }

  const usuario = await criarUsuarioAdmin(email, senha, telefone ?? null);
  console.log('Usuário admin criado:', usuario);
  await pool.end();
}

main().catch((error) => {
  console.error('Erro ao criar usuário admin:', error);
  process.exit(1);
});
