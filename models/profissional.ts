import { pool, withTransaction } from '@/infra/database';
import type { PoolClient } from 'pg';
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

function validarNome(nome: string) {
  if (!nome.trim()) {
    throw new AppError('Nome não pode ser vazio');
  }
}

function normalizarServicoIds(servicoIds: number[]): number[] {
  return [...new Set(servicoIds)];
}

async function validarServicosExistentes(client: PoolClient, servicoIds: number[]) {
  if (servicoIds.length === 0) return;

  const { rows } = await client.query(`SELECT id FROM servicos WHERE id = ANY($1::integer[])`, [
    servicoIds,
  ]);

  const existentes = new Set(rows.map((row) => row.id as number));
  const inexistentes = servicoIds.filter((id) => !existentes.has(id));

  if (inexistentes.length > 0) {
    throw new AppError(`Serviço não encontrado: ${inexistentes.join(', ')}`, 404);
  }
}

async function substituirVinculos(
  client: PoolClient,
  profissionalId: number,
  servicoIds: number[],
) {
  const ids = normalizarServicoIds(servicoIds);

  await validarServicosExistentes(client, ids);

  await client.query(`DELETE FROM profissional_servicos WHERE profissional_id = $1`, [
    profissionalId,
  ]);

  if (ids.length === 0) return;

  await client.query(
    `INSERT INTO profissional_servicos (profissional_id, servico_id)
     SELECT $1, unnest($2::integer[])`,
    [profissionalId, ids],
  );
}

// Substitui por completo o conjunto de serviços de um profissional.
// Desmarcar = remover o vínculo; marcar = criar. A operação é transacional.
export async function definirServicosDoProfissional(profissionalId: number, servicoIds: number[]) {
  await comLockDeProfissional(profissionalId, async () => {
    await withTransaction(async (client) => {
      const { rows } = await client.query(`SELECT id FROM profissionais WHERE id = $1 FOR UPDATE`, [
        profissionalId,
      ]);
      if (rows.length === 0) {
        throw new AppError('Profissional não encontrado', 404);
      }

      await substituirVinculos(client, profissionalId, servicoIds);
    });
  });
}

export async function criarProfissional(input: {
  nome: string;
  telefoneContato?: string | null;
  servicoIds?: number[];
}) {
  validarNome(input.nome);

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO profissionais (nome, telefone_contato)
       VALUES ($1, $2)
       RETURNING id, nome, telefone_contato, ativo, antecedencia_minima_horas`,
      [input.nome.trim(), input.telefoneContato ?? null],
    );
    const profissional = rows[0] as Profissional;

    if (input.servicoIds !== undefined) {
      await substituirVinculos(client, profissional.id, input.servicoIds);
    }

    return profissional;
  });
}

export async function atualizarProfissional(
  id: number,
  dados: { nome?: string; telefoneContato?: string | null; servicoIds?: number[] },
) {
  return comLockDeProfissional(id, async () => {
    return withTransaction(async (client) => {
      const { rows: atuais } = await client.query(
        `SELECT id, nome, telefone_contato, ativo, antecedencia_minima_horas
         FROM profissionais
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );

      if (atuais.length === 0) {
        throw new AppError('Profissional não encontrado', 404);
      }

      const atual = atuais[0] as Profissional;
      const nome = dados.nome ?? atual.nome;
      validarNome(nome);

      const { rows } = await client.query(
        `UPDATE profissionais
         SET nome = $1, telefone_contato = $2
         WHERE id = $3
         RETURNING id, nome, telefone_contato, ativo, antecedencia_minima_horas`,
        [
          nome.trim(),
          dados.telefoneContato !== undefined ? dados.telefoneContato : atual.telefone_contato,
          id,
        ],
      );

      if (dados.servicoIds !== undefined) {
        await substituirVinculos(client, id, dados.servicoIds);
      }

      return rows[0] as Profissional;
    });
  });
}

async function contarProfissionaisAtivos(
  client: PoolClient,
  excluindoId?: number,
): Promise<number> {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM profissionais
     WHERE ativo = true AND id != COALESCE($1, -1)`,
    [excluindoId ?? null],
  );
  return rows[0].total;
}

async function contarProfissionais(client: PoolClient): Promise<number> {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS total FROM profissionais`);
  return rows[0].total;
}

export async function definirAtivoProfissional(id: number, ativo: boolean) {
  return comLockDeProfissional(id, async () => {
    return withTransaction(async (client) => {
      // Lock global apenas para preservar a invariável "existe pelo menos um ativo"
      // quando duas mudanças de profissionais acontecem ao mesmo tempo.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        'profissionais:invariantes',
      ]);

      const { rows } = await client.query(
        `SELECT id, nome, telefone_contato, ativo, antecedencia_minima_horas
         FROM profissionais
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      if (rows.length === 0) {
        throw new AppError('Profissional não encontrado', 404);
      }

      if (!ativo && rows[0].ativo) {
        const restantes = await contarProfissionaisAtivos(client, id);
        if (restantes === 0) {
          throw new AppError('Precisa existir pelo menos um profissional ativo');
        }
      }

      const { rows: atualizadas } = await client.query(
        `UPDATE profissionais SET ativo = $1 WHERE id = $2
         RETURNING id, nome, telefone_contato, ativo, antecedencia_minima_horas`,
        [ativo, id],
      );

      return atualizadas[0] as Profissional;
    });
  });
}

export async function excluirProfissional(id: number): Promise<void> {
  await comLockDeProfissional(id, async () => {
    await withTransaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        'profissionais:invariantes',
      ]);

      const { rows } = await client.query(
        `SELECT id, ativo
         FROM profissionais
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      if (rows.length === 0) {
        throw new AppError('Profissional não encontrado', 404);
      }

      const total = await contarProfissionais(client);
      if (total <= 1) {
        throw new AppError('Precisa existir pelo menos um profissional cadastrado');
      }

      if (rows[0].ativo) {
        const restantes = await contarProfissionaisAtivos(client, id);
        if (restantes === 0) {
          throw new AppError('Precisa existir pelo menos um profissional ativo');
        }
      }

      const { rows: agendamentos } = await client.query(
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

      await client.query(`DELETE FROM profissionais WHERE id = $1`, [id]);
    });
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
