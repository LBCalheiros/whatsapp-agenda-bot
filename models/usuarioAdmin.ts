import { pool } from '@/infra/database';
import { gerarHashSenha, verificarSenha } from '@/infra/senha';

export type UsuarioAdmin = {
  id: number;
  email: string;
  senha_hash: string;
  role: string;
  versao_token: number;
  telefone_notificacao: string | null;
  criado_em: string;
};

export async function criarUsuarioAdmin(
  email: string,
  senhaPlana: string,
  telefoneNotificacao: string | null = null,
  role = 'admin',
) {
  const senhaHash = gerarHashSenha(senhaPlana);
  const { rows } = await pool.query(
    `INSERT INTO usuarios_admin (email, senha_hash, role, telefone_notificacao) VALUES ($1, $2, $3, $4)
     RETURNING id, email, role, telefone_notificacao, criado_em`,
    [email, senhaHash, role, telefoneNotificacao],
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

// invalida todo token de sessão emitido antes desse ponto (usado no logout)
export async function invalidarSessoes(usuarioId: number): Promise<number> {
  const { rows } = await pool.query(
    `UPDATE usuarios_admin SET versao_token = versao_token + 1 WHERE id = $1 RETURNING versao_token`,
    [usuarioId],
  );
  return rows[0]?.versao_token;
}
