import { config } from 'dotenv';
config({ path: '.env.development' });

import { pool } from '../infra/database';

async function main() {
  const { rows } = await pool.query(
    `SELECT id, email, role, telefone_notificacao, criado_em FROM usuarios_admin ORDER BY id`,
  );

  if (rows.length === 0) {
    console.log('Nenhum admin cadastrado.');
  } else {
    console.table(rows);
  }

  await pool.end();
}

main().catch((error) => {
  console.error('Erro ao listar admins:', error);
  process.exit(1);
});
