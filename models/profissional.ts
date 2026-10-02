import { pool } from '@/infra/database';
import { AppError } from '@/infra/errors';

export async function listarProfissionaisAtivos() {
  const { rows } = await pool.query(
    `SELECT id, nome FROM profissionais WHERE ativo = true ORDER BY nome`,
  );
  return rows;
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
