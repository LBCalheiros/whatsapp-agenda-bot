import { pool, withTransaction } from '@/infra/database';
import { AppError } from '@/infra/errors';
import { comLockDeProfissional } from '@/infra/lockProfissional';

export type Profissional = {
  id: number;
  nome: string;
  telefone_contato: string | null;
  ativo: boolean;
  antecedencia_minima_horas: number;
};

export async function listarProfissionaisAtivos() {
  const { rows } = await pool.query(
    `SELECT id, nome, telefone_contato, ativo, antecedencia_minima_horas
     FROM profissionais WHERE ativo = true ORDER BY nome`,
  );
  return rows as Profissional[];
}

// Usada pela tela de gestão — mostra inativos também, pra dar pra reativar.
export async function listarTodosProfissionais() {
  const { rows } = await pool.query(
    `SELECT id, nome, telefone_contato, ativo, antecedencia_minima_horas
     FROM profissionais ORDER BY ativo DESC, nome`,
  );
  return rows as Profissional[];
}

export async function buscarProfissionalPorId(id: number) {
  const { rows } = await pool.query(
    `SELECT id, nome, telefone_contato, ativo, antecedencia_minima_horas
     FROM profissionais WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) {
    throw new AppError('Profissional não encontrado', 404);
  }
  return rows[0] as Profissional;
}

export async function listarServicoIdsDoProfissional(profissionalId: number): Promise<number[]> {
  const { rows } = await pool.query(
    `SELECT servico_id FROM profissional_servicos WHERE profissional_id = $1`,
    [profissionalId],
  );
  return rows.map((r) => r.servico_id);
}

export async function profissionalAtendeServico(
  profissionalId: number,
  servicoId: number,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM profissional_servicos WHERE profissional_id = $1 AND servico_id = $2`,
    [profissionalId, servicoId],
  );
  return rows.length > 0;
}

// Substitui por completo o conjunto de serviços de um profissional (desmarcar
// = remover o vínculo, marcar = criar). Roda em transação pra nunca deixar o
// profissional com um conjunto pela metade se algo falhar no meio.
export async function definirServicosDoProfissional(profissionalId: number, servicoIds: number[]) {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM profissional_servicos WHERE profissional_id = $1`, [
      profissionalId,
    ]);
    for (const servicoId of servicoIds) {
      await client.query(
        `INSERT INTO profissional_servicos (profissional_id, servico_id) VALUES ($1, $2)`,
        [profissionalId, servicoId],
      );
    }
  });
}

function validarNome(nome: string) {
  if (!nome.trim()) {
    throw new AppError('Nome não pode ser vazio');
  }
}

export async function criarProfissional(input: {
  nome: string;
  telefoneContato?: string | null;
  servicoIds?: number[];
}) {
  validarNome(input.nome);

  const { rows } = await pool.query(
    `INSERT INTO profissionais (nome, telefone_contato)
     VALUES ($1, $2)
     RETURNING id, nome, telefone_contato, ativo, antecedencia_minima_horas`,
    [input.nome.trim(), input.telefoneContato ?? null],
  );
  const profissional = rows[0] as Profissional;

  if (input.servicoIds && input.servicoIds.length > 0) {
    await definirServicosDoProfissional(profissional.id, input.servicoIds);
  }

  return profissional;
}

export async function atualizarProfissional(
  id: number,
  dados: { nome?: string; telefoneContato?: string | null; servicoIds?: number[] },
) {
  const atual = await buscarProfissionalPorId(id);
  const nome = dados.nome ?? atual.nome;
  validarNome(nome);

  const { rows } = await pool.query(
    `UPDATE profissionais SET nome = $1, telefone_contato = $2 WHERE id = $3
     RETURNING id, nome, telefone_contato, ativo, antecedencia_minima_horas`,
    [
      nome,
      dados.telefoneContato !== undefined ? dados.telefoneContato : atual.telefone_contato,
      id,
    ],
  );

  if (dados.servicoIds !== undefined) {
    await definirServicosDoProfissional(id, dados.servicoIds);
  }

  return rows[0] as Profissional;
}

async function contarProfissionaisAtivos(excluindoId?: number): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM profissionais
     WHERE ativo = true AND id != COALESCE($1, -1)`,
    [excluindoId ?? null],
  );
  return rows[0].total;
}

export async function definirAtivoProfissional(id: number, ativo: boolean) {
  if (!ativo) {
    const restantes = await contarProfissionaisAtivos(id);
    if (restantes === 0) {
      throw new AppError('Precisa existir pelo menos um profissional ativo');
    }
  }

  const { rows } = await pool.query(
    `UPDATE profissionais SET ativo = $1 WHERE id = $2
     RETURNING id, nome, telefone_contato, ativo, antecedencia_minima_horas`,
    [ativo, id],
  );
  if (rows.length === 0) {
    throw new AppError('Profissional não encontrado', 404);
  }
  return rows[0] as Profissional;
}

export async function excluirProfissional(id: number): Promise<void> {
  await comLockDeProfissional(id, async () => {
    const profissional = await buscarProfissionalPorId(id);

    if (profissional.ativo) {
      const restantes = await contarProfissionaisAtivos(id);
      if (restantes === 0) {
        throw new AppError('Precisa existir pelo menos um profissional ativo');
      }
    }

    const { rows: agendamentos } = await pool.query(
      `SELECT 1
       FROM agendamentos
       WHERE profissional_id = $1
       LIMIT 1`,
      [id],
    );

    if (agendamentos.length > 0) {
      throw new AppError(
        'Não é possível excluir um profissional que possui agendamentos. Desative-o para preservar o histórico.',
        409,
      );
    }

    await pool.query(`DELETE FROM profissionais WHERE id = $1`, [id]);
  });
}

export async function buscarAntecedenciaMinima(profissionalId: number): Promise<number> {
  const { rows } = await pool.query(
    `SELECT antecedencia_minima_horas FROM profissionais WHERE id = $1`,
    [profissionalId],
  );
  if (rows.length === 0) {
    throw new AppError('Profissional não encontrado', 404);
  }
  return rows[0].antecedencia_minima_horas;
}

export async function atualizarAntecedenciaMinima(profissionalId: number, horas: number) {
  if (horas < 0) {
    throw new AppError('Antecedência mínima não pode ser negativa');
  }

  const { rows } = await pool.query(
    `UPDATE profissionais SET antecedencia_minima_horas = $1 WHERE id = $2
     RETURNING antecedencia_minima_horas`,
    [horas, profissionalId],
  );
  if (rows.length === 0) {
    throw new AppError('Profissional não encontrado', 404);
  }
  return rows[0].antecedencia_minima_horas as number;
}