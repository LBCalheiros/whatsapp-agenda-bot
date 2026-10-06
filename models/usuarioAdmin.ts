import { pool } from '@/infra/database';
import { gerarHashSenha, verificarSenha } from '@/infra/senha';
import { AppError } from '@/infra/errors';

export type UsuarioAdmin = {
  id: number;
  email: string;
  senha_hash: string;
  role: 'gerente' | 'funcionario';
  versao_token: number;
  telefone_notificacao: string | null;
  profissional_id: number | null;
  ativo: boolean;
  criado_em: string;
};

// Colunas seguras pra devolver em qualquer resposta de API — nunca senha_hash.
const COLUNAS_SEGURAS = `id, email, role, telefone_notificacao, profissional_id, ativo, criado_em`;

export async function criarUsuarioAdmin(
  email: string,
  senhaPlana: string,
  telefoneNotificacao: string | null = null,
  role: 'gerente' | 'funcionario' = 'gerente',
  profissionalId: number | null = null,
) {
  const senhaHash = gerarHashSenha(senhaPlana);

  function ehViolacaoDeConstraintUnica(error: unknown): error is { code: string } {
    return typeof error === 'object' && error !== null && 'code' in error;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO usuarios_admin (email, senha_hash, role, telefone_notificacao, profissional_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUNAS_SEGURAS}`,
      [email, senhaHash, role, telefoneNotificacao, profissionalId],
    );
    return rows[0];
  } catch (error) {
    if (ehViolacaoDeConstraintUnica(error) && error.code === '23505') {
      throw new AppError('Já existe um funcionário com esse e-mail');
    }
    throw error;
  }
}

export async function autenticar(email: string, senhaPlana: string): Promise<UsuarioAdmin | null> {
  const { rows } = await pool.query(`SELECT * FROM usuarios_admin WHERE email = $1`, [email]);
  const usuario = rows[0];
  if (!usuario) return null;
  if (!usuario.ativo) return null;

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

// troca a senha e invalida qualquer sessão existente na mesma operação (se alguém
// tinha acesso com a senha antiga, a troca não deveria deixar a sessão dele valendo)
export async function redefinirSenha(email: string, novaSenha: string): Promise<UsuarioAdmin> {
  const senhaHash = gerarHashSenha(novaSenha);
  const { rows } = await pool.query(
    `UPDATE usuarios_admin
     SET senha_hash = $1, versao_token = versao_token + 1
     WHERE email = $2
     RETURNING ${COLUNAS_SEGURAS}`,
    [senhaHash, email],
  );
  if (rows.length === 0) {
    throw new AppError('Usuário não encontrado', 404);
  }
  return rows[0];
}

export async function excluirUsuarioAdmin(email: string): Promise<void> {
  const { rowCount } = await pool.query(`DELETE FROM usuarios_admin WHERE email = $1`, [email]);
  if (!rowCount) {
    throw new AppError('Usuário não encontrado', 404);
  }
}

// --- A partir daqui: funções novas pro CRUD de funcionários pelo painel (#24/#25) ---

export async function listarFuncionarios() {
  const { rows } = await pool.query(`SELECT ${COLUNAS_SEGURAS} FROM usuarios_admin ORDER BY email`);
  return rows;
}

export async function buscarFuncionarioPorId(id: number) {
  const { rows } = await pool.query(`SELECT ${COLUNAS_SEGURAS} FROM usuarios_admin WHERE id = $1`, [
    id,
  ]);
  if (rows.length === 0) {
    throw new AppError('Funcionário não encontrado', 404);
  }
  return rows[0];
}

async function contarGerentesAtivos(excluindoId?: number): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM usuarios_admin
     WHERE role = 'gerente' AND ativo = true AND id != COALESCE($1, -1)`,
    [excluindoId ?? null],
  );
  return rows[0].total;
}

// Edição dos próprios dados — email, telefone de notificação e senha.
// Nunca mexe em role, profissional_id ou ativo: isso é privilégio de gerente,
// e nem um gerente editando a si mesmo passa por aqui (ver updateProprioRole).
export async function atualizarPerfilProprio(
  id: number,
  dados: { email?: string; telefoneNotificacao?: string | null; novaSenha?: string },
) {
  const campos: string[] = [];
  const valores: unknown[] = [];

  if (dados.email !== undefined) {
    valores.push(dados.email);
    campos.push(`email = $${valores.length}`);
  }
  if (dados.telefoneNotificacao !== undefined) {
    valores.push(dados.telefoneNotificacao);
    campos.push(`telefone_notificacao = $${valores.length}`);
  }
  if (dados.novaSenha !== undefined) {
    valores.push(gerarHashSenha(dados.novaSenha));
    campos.push(`senha_hash = $${valores.length}`);
    campos.push(`versao_token = versao_token + 1`);
  }

  if (campos.length === 0) {
    return buscarFuncionarioPorId(id);
  }

  valores.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE usuarios_admin SET ${campos.join(', ')} WHERE id = $${valores.length}
       RETURNING ${COLUNAS_SEGURAS}`,
      valores,
    );
    if (rows.length === 0) {
      throw new AppError('Funcionário não encontrado', 404);
    }
    return rows[0];
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new AppError('Já existe um funcionário com esse e-mail');
    }
    throw error;
  }
}

export async function atualizarFuncionarioComoGerente(
  id: number,
  idDoGerenteLogado: number,
  dados: {
    email?: string;
    telefoneNotificacao?: string | null;
    novaSenha?: string;
    role?: 'gerente' | 'funcionario';
    profissionalId?: number | null;
  },
) {
  if (dados.role === 'funcionario' && id === idDoGerenteLogado) {
    throw new AppError('Você não pode rebaixar a si mesmo');
  }

  if (dados.role === 'funcionario') {
    const restantes = await contarGerentesAtivos(id);
    if (restantes === 0) {
      throw new AppError('Precisa existir pelo menos um gerente ativo');
    }
  }

  const campos: string[] = [];
  const valores: unknown[] = [];
  let precisaInvalidarToken = false;

  if (dados.email !== undefined) {
    valores.push(dados.email);
    campos.push(`email = $${valores.length}`);
  }
  if (dados.telefoneNotificacao !== undefined) {
    valores.push(dados.telefoneNotificacao);
    campos.push(`telefone_notificacao = $${valores.length}`);
  }

  if (dados.novaSenha !== undefined) {
    valores.push(gerarHashSenha(dados.novaSenha));
    campos.push(`senha_hash = $${valores.length}`);
    precisaInvalidarToken = true;
  }

  if (dados.role !== undefined) {
    valores.push(dados.role);
    campos.push(`role = $${valores.length}`);
    precisaInvalidarToken = true;
  }
  if (dados.profissionalId !== undefined) {
    valores.push(dados.profissionalId);
    campos.push(`profissional_id = $${valores.length}`);
  }

  if (precisaInvalidarToken) {
    campos.push(`versao_token = versao_token + 1`);
  }

  if (campos.length === 0) {
    return buscarFuncionarioPorId(id);
  }

  valores.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE usuarios_admin SET ${campos.join(', ')} WHERE id = $${valores.length}
       RETURNING ${COLUNAS_SEGURAS}`,
      valores,
    );
    if (rows.length === 0) {
      throw new AppError('Funcionário não encontrado', 404);
    }
    return rows[0];
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new AppError('Já existe um funcionário com esse e-mail');
    }
    throw error;
  }
}

export async function definirAtivo(id: number, idDoGerenteLogado: number, ativo: boolean) {
  if (!ativo && id === idDoGerenteLogado) {
    throw new AppError('Você não pode desativar a si mesmo');
  }

  if (!ativo) {
    const restantes = await contarGerentesAtivos(id);
    const { rows: alvo } = await pool.query(`SELECT role FROM usuarios_admin WHERE id = $1`, [id]);
    if (alvo[0]?.role === 'gerente' && restantes === 0) {
      throw new AppError('Precisa existir pelo menos um gerente ativo');
    }
  }

  const { rows } = await pool.query(
    `UPDATE usuarios_admin SET ativo = $1, versao_token = versao_token + 1 WHERE id = $2
     RETURNING ${COLUNAS_SEGURAS}`,
    [ativo, id],
  );
  if (rows.length === 0) {
    throw new AppError('Funcionário não encontrado', 404);
  }
  return rows[0];
}

export async function excluirFuncionarioPorId(id: number, idDoGerenteLogado: number) {
  if (id === idDoGerenteLogado) {
    throw new AppError('Você não pode excluir a si mesmo');
  }

  const { rows: alvo } = await pool.query(`SELECT role FROM usuarios_admin WHERE id = $1`, [id]);
  if (alvo.length === 0) {
    throw new AppError('Funcionário não encontrado', 404);
  }

  if (alvo[0].role === 'gerente') {
    const restantes = await contarGerentesAtivos(id);
    if (restantes === 0) {
      throw new AppError('Precisa existir pelo menos um gerente ativo');
    }
  }

  await pool.query(`DELETE FROM usuarios_admin WHERE id = $1`, [id]);
}

export async function atualizarTelefoneNotificacao(
  email: string,
  telefoneNotificacao: string | null,
): Promise<UsuarioAdmin> {
  const { rows } = await pool.query(
    `UPDATE usuarios_admin
     SET telefone_notificacao = $1
     WHERE email = $2
     RETURNING id, email, role, telefone_notificacao, criado_em`,
    [telefoneNotificacao, email],
  );

  if (rows.length === 0) {
    throw new AppError('Usuário não encontrado', 404);
  }

  return rows[0];
}
