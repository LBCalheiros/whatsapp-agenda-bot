import { pool } from '@/infra/database';
import { gerarHashSenha, verificarSenha } from '@/infra/senha';

export type UsuarioAdmin = {
  id: number;
  email: string;
  senha_hash: string;
  role: string;
  versao_token: number;
  criado_em: string;
};

export async function criarUsuarioAdmin(email: string, senhaPlana: string, role = 'admin') {
  const senhaHash = gerarHashSenha(senhaPlana);
  const { rows } = await pool.query(
    `INSERT INTO usuarios_admin (email, senha_hash, role) VALUES ($1, $2, $3)
     RETURNING id, email, role, criado_em`,
    [email, senhaHash, role],
  );
  return rows[0];
}

export async function autenticar(email: string, senhaPlana: string): Promise<UsuarioAdmin | null> {
  const { rows } = await pool.query(`SELECT * FROM usuarios_admin WHERE email = $1`, [email]);
  const usuario = rows[0];
  if (!usuario) return null;

  if (!verificarSenha(senhaPlana, usuario.senha_hash)) return null;

  return usuario;
}

export async function invalidarSessoes(usuarioId: number): Promise<number> {
  const { rows } = await pool.query(
    `UPDATE usuarios_admin SET versao_token = versao_token + 1 WHERE id = $1 RETURNING versao_token`,
    [usuarioId],
  );
  return rows[0]?.versao_token;
}
