import { pool, withTransaction } from '@/infra/database';
import { AppError } from '@/infra/errors';
import { fimDoDiaBRT, inicioDoDiaBRT } from '@/infra/data';
import { obterProfissionalDisponivel, validarHorarioDisponivel } from '@/models/disponibilidade';
import { buscarAntecedenciaMinima, profissionalAtendeServico } from '@/models/profissional';
import { comLockDeProfissional } from '@/infra/lockProfissional';
import { comLockDeAgendamento } from '@/infra/lockAgendamento';

type StatusAgendamento = 'agendado' | 'confirmado' | 'cancelado' | 'completo' | 'nao_compareceu';

type Agendamento = {
  id: number;
  cliente_id: number;
  profissional_id: number;
  servico_id: number;
  data_hora: string;
  status: StatusAgendamento;
  lembrete_enviado: boolean;
  observacoes: string | null;
  duracao_minutos: number;
  preco: string | null;
};

export const ANTECEDENCIA_MINIMA_HORAS = 2;
const DIAS_HISTORICO = 30;

function ehViolacaoDeConstraintUnica(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
  );
}

export async function criarAgendamento(input: {
  clienteId: number;
  profissionalId: number;
  servicoId: number;
  dataHora: Date;
}) {
  const { clienteId, profissionalId, servicoId, dataHora } = input;

  return comLockDeProfissional(profissionalId, async () => {
    const atende = await profissionalAtendeServico(profissionalId, servicoId);

    if (!atende) {
      throw new AppError('Esse profissional não atende esse serviço');
    }

    const antecedenciaMinimaHoras = await buscarAntecedenciaMinima(profissionalId);

    const horasAteAgendamento = (dataHora.getTime() - Date.now()) / (1000 * 60 * 60);

    if (horasAteAgendamento < antecedenciaMinimaHoras) {
      throw new AppError(
        `Agendamentos precisam ser feitos com pelo menos ${antecedenciaMinimaHoras}h de antecedência`,
      );
    }

    const { rows: servicos } = await pool.query(
      `SELECT duracao_minutos, preco
       FROM servicos
       WHERE id = $1 AND ativo = true`,
      [servicoId],
    );

    if (servicos.length === 0) {
      throw new AppError('Serviço não encontrado ou inativo');
    }

    const duracaoMinutos = servicos[0].duracao_minutos;
    const preco = servicos[0].preco;

    await validarHorarioDisponivel(profissionalId, dataHora, duracaoMinutos);

    try {
      const { rows } = await pool.query(
        `INSERT INTO agendamentos
         (cliente_id, profissional_id, servico_id, data_hora, duracao_minutos, preco)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [clienteId, profissionalId, servicoId, dataHora, duracaoMinutos, preco],
      );

      return rows[0] as Agendamento;
    } catch (error) {
      if (ehViolacaoDeConstraintUnica(error) && error.code === '23505') {
        throw new AppError('Esse horário acabou de ser ocupado, escolha outro');
      }

      throw error;
    }
  });
}

export async function listarAgendamentos(filtros: {
  clienteId?: number;
  profissionalId?: number;
  servicoId?: number;
  buscaCliente?: string;
  dataInicio?: Date;
  dataFim?: Date;
  status?: string;
  apenasFuturos?: boolean;
  historico?: boolean;
}) {
  const condicoes: string[] = [];
  const valores: unknown[] = [];

  if (filtros.clienteId) {
    valores.push(filtros.clienteId);
    condicoes.push(`a.cliente_id = $${valores.length}`);
  }

  if (filtros.profissionalId) {
    valores.push(filtros.profissionalId);
    condicoes.push(`a.profissional_id = $${valores.length}`);
  }

  if (filtros.servicoId) {
    valores.push(filtros.servicoId);
    condicoes.push(`a.servico_id = $${valores.length}`);
  }

  if (filtros.buscaCliente) {
    valores.push(`%${filtros.buscaCliente}%`);
    condicoes.push(`(c.nome ILIKE $${valores.length} OR c.telefone ILIKE $${valores.length})`);
  }

  if (filtros.status) {
    valores.push(filtros.status);
    condicoes.push(`a.status = $${valores.length}`);
  }

  if (filtros.apenasFuturos) {
    valores.push(new Date());
    condicoes.push(`a.data_hora >= $${valores.length} AND a.status != 'cancelado'`);
  }

  if (filtros.historico) {
    const agora = new Date();
    const limite = new Date(agora.getTime() - DIAS_HISTORICO * 24 * 60 * 60 * 1000);

    valores.push(limite, agora);

    const iLimite = valores.length - 1;
    const iAgora = valores.length;

    condicoes.push(`(
      (a.status = 'completo' AND a.data_hora BETWEEN $${iLimite} AND $${iAgora})
      OR (a.status = 'cancelado' AND EXISTS (
        SELECT 1
        FROM historico_agendamentos h
        WHERE h.agendamento_id = a.id
          AND h.status_novo = 'cancelado'
          AND h.alterado_em BETWEEN $${iLimite} AND $${iAgora}
      ))
    )`);
  }

  if (filtros.dataInicio && filtros.dataFim) {
    const inicioDia = inicioDoDiaBRT(filtros.dataInicio);
    const fimDia = fimDoDiaBRT(filtros.dataFim);

    valores.push(inicioDia, fimDia);

    condicoes.push(`a.data_hora BETWEEN $${valores.length - 1} AND $${valores.length}`);
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  const ordem = filtros.historico ? 'a.data_hora DESC' : 'a.data_hora ASC';

  const { rows } = await pool.query(
    `SELECT
       a.*,
       c.nome AS cliente_nome,
       c.telefone AS cliente_telefone,
       p.nome AS profissional_nome,
       s.nome AS servico_nome
     FROM agendamentos a
     JOIN clientes c ON c.id = a.cliente_id
     JOIN profissionais p ON p.id = a.profissional_id
     JOIN servicos s ON s.id = a.servico_id
     ${where}
     ORDER BY ${ordem}`,
    valores,
  );

  return rows;
}

export async function calcularReceita(filtros: { dataInicio?: Date; dataFim?: Date }) {
  const condicoes = [`a.status = 'completo'`];
  const valores: unknown[] = [];

  if (filtros.dataInicio && filtros.dataFim) {
    const inicioDia = inicioDoDiaBRT(filtros.dataInicio);
    const fimDia = fimDoDiaBRT(filtros.dataFim);

    valores.push(inicioDia, fimDia);

    condicoes.push(`a.data_hora BETWEEN $${valores.length - 1} AND $${valores.length}`);
  }

  const { rows } = await pool.query(
    `SELECT
       s.id AS servico_id,
       s.nome AS servico_nome,
       COUNT(*)::int AS quantidade,
       COALESCE(SUM(a.preco), 0) AS total,
       COUNT(*) FILTER (WHERE a.preco IS NULL)::int AS sem_preco
     FROM agendamentos a
     JOIN servicos s ON s.id = a.servico_id
     WHERE ${condicoes.join(' AND ')}
     GROUP BY s.id, s.nome
     ORDER BY total DESC`,
    valores,
  );

  const totalGeral = rows.reduce((soma, r) => soma + Number(r.total), 0);

  const quantidadeSemPreco = rows.reduce((soma, r) => soma + r.sem_preco, 0);

  return {
    totalGeral,
    quantidadeSemPreco,
    porServico: rows.map((r) => ({
      servicoId: r.servico_id,
      servicoNome: r.servico_nome,
      quantidade: r.quantidade,
      total: Number(r.total),
      quantidadeSemPreco: r.sem_preco,
    })),
  };
}

function validarTransicaoStatus(statusAtual: StatusAgendamento, statusNovo: StatusAgendamento) {
  const transicoesPermitidas: Record<StatusAgendamento, readonly StatusAgendamento[]> = {
    agendado: ['confirmado', 'cancelado', 'completo', 'nao_compareceu'],
    confirmado: ['cancelado', 'completo', 'nao_compareceu'],
    cancelado: [],
    completo: [],
    nao_compareceu: [],
  };

  if (statusAtual === statusNovo) return;

  if (!transicoesPermitidas[statusAtual].includes(statusNovo)) {
    throw new AppError(
      `Não é possível alterar um agendamento de ${statusAtual} para ${statusNovo}`,
    );
  }
}

export async function buscarPorId(agendamentoId: number): Promise<Agendamento> {
  const { rows } = await pool.query(`SELECT * FROM agendamentos WHERE id = $1`, [agendamentoId]);

  if (rows.length === 0) {
    throw new AppError('Agendamento não encontrado', 404);
  }

  return rows[0];
}

export async function atualizarObservacoes(agendamentoId: number, observacoes: string | null) {
  const { rows } = await pool.query(
    `UPDATE agendamentos
     SET observacoes = $1
     WHERE id = $2
     RETURNING *`,
    [observacoes, agendamentoId],
  );

  if (rows.length === 0) {
    throw new AppError('Agendamento não encontrado', 404);
  }

  return rows[0] as Agendamento;
}

async function cancelarSemLock(agendamento: Agendamento): Promise<Agendamento> {
  validarTransicaoStatus(agendamento.status, 'cancelado');

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE agendamentos
       SET status = 'cancelado'
       WHERE id = $1 AND status = $2
       RETURNING *`,
      [agendamento.id, agendamento.status],
    );

    if (rows.length === 0) {
      throw new AppError('Agendamento foi alterado por outra operação');
    }

    await registrarHistoricoNaTransacao(client, agendamento.id, agendamento.status, 'cancelado');

    return rows[0] as Agendamento;
  });
}

export async function cancelarAgendamento(agendamentoId: number) {
  return comLockDeAgendamento(agendamentoId, async () => {
    const agendamento = await buscarPorId(agendamentoId);

    if (agendamento.status === 'cancelado') {
      return agendamento;
    }

    return cancelarSemLock(agendamento);
  });
}

export async function cancelarComoCliente(agendamentoId: number) {
  return comLockDeAgendamento(agendamentoId, async () => {
    const agendamento = await buscarPorId(agendamentoId);

    if (agendamento.status === 'cancelado') {
      return agendamento;
    }

    const horasAteAgendamento =
      (new Date(agendamento.data_hora).getTime() - Date.now()) / (1000 * 60 * 60);

    if (horasAteAgendamento < 24) {
      throw new AppError('Cancelamento só é permitido até 24h antes do horário agendado');
    }

    return cancelarSemLock(agendamento);
  });
}

async function marcarComoCompletoSemLock(
  agendamento: Agendamento,
  somenteSeJaTerminou: boolean,
): Promise<Agendamento | null> {
  if (agendamento.status === 'completo') {
    return agendamento;
  }

  validarTransicaoStatus(agendamento.status, 'completo');

  if (somenteSeJaTerminou) {
    const fim = new Date(
      new Date(agendamento.data_hora).getTime() + agendamento.duracao_minutos * 60_000,
    );

    if (fim >= new Date()) {
      return null;
    }
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE agendamentos
       SET status = 'completo'
       WHERE id = $1 AND status = $2
       RETURNING *`,
      [agendamento.id, agendamento.status],
    );

    if (rows.length === 0) {
      throw new AppError('Agendamento foi alterado por outra operação');
    }

    await registrarHistoricoNaTransacao(client, agendamento.id, agendamento.status, 'completo');

    return rows[0] as Agendamento;
  });
}

export async function marcarComoCompleto(agendamentoId: number): Promise<Agendamento> {
  return comLockDeAgendamento(agendamentoId, async () => {
    const agendamento = await buscarPorId(agendamentoId);
    const resultado = await marcarComoCompletoSemLock(agendamento, false);
    if (!resultado) {
      throw new AppError('Não foi possível concluir o agendamento');
    }
    return resultado;
  });
}

export async function concluirAgendamentosPassados(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT a.id
     FROM agendamentos a
     WHERE a.status IN ('agendado', 'confirmado')
       AND (
         a.data_hora +
         make_interval(mins => a.duracao_minutos)
       ) < now()`,
  );

  let concluidos = 0;

  for (const row of rows) {
    const concluiu = await comLockDeAgendamento(row.id, async () => {
      const agendamento = await buscarPorId(row.id);

      if (!['agendado', 'confirmado'].includes(agendamento.status)) {
        return false;
      }

      const resultado = await marcarComoCompletoSemLock(agendamento, true);
      return resultado !== null;
    });

    if (concluiu) {
      concluidos++;
    }
  }

  return concluidos;
}

export async function reagendarAgendamento(agendamentoId: number, novaDataHora: Date) {
  return comLockDeAgendamento(agendamentoId, async () => {
    const agendamento = await buscarPorId(agendamentoId);

    if (!['agendado', 'confirmado'].includes(agendamento.status)) {
      throw new AppError('Só é possível reagendar agendamentos ativos');
    }

    const duracaoMinutos = agendamento.duracao_minutos;

    const profissionalId = await obterProfissionalDisponivel(
      agendamento.servico_id,
      novaDataHora,
      duracaoMinutos,
      agendamentoId,
    );

    return comLockDeProfissional(profissionalId, async () => {
      const atende = await profissionalAtendeServico(profissionalId, agendamento.servico_id);

      if (!atende) {
        throw new AppError('Esse profissional não atende esse serviço');
      }

      await validarHorarioDisponivel(profissionalId, novaDataHora, duracaoMinutos, agendamentoId);

      const antecedenciaMinimaHoras = await buscarAntecedenciaMinima(profissionalId);

      const horasAteNovoAgendamento = (novaDataHora.getTime() - Date.now()) / (1000 * 60 * 60);

      if (horasAteNovoAgendamento < antecedenciaMinimaHoras) {
        throw new AppError(
          `Reagendamentos precisam ser feitos com pelo menos ${antecedenciaMinimaHoras}h de antecedência`,
        );
      }

      return withTransaction(async (client) => {
        try {
          const { rows } = await client.query(
            `UPDATE agendamentos
             SET data_hora = $1,
                 profissional_id = $2,
                 lembrete_enviado = false
             WHERE id = $3 AND status = $4
             RETURNING *`,
            [novaDataHora, profissionalId, agendamentoId, agendamento.status],
          );

          if (rows.length === 0) {
            throw new AppError('Agendamento foi alterado por outra operação');
          }
        } catch (error) {
          if (ehViolacaoDeConstraintUnica(error) && error.code === '23505') {
            throw new AppError(
              'Já existe um agendamento nesse exato horário para esse profissional',
            );
          }
          throw error;
        }

        await registrarHistoricoNaTransacao(
          client,
          agendamentoId,
          agendamento.status,
          agendamento.status,
          agendamento.data_hora,
        );

        return true;
      });
    });
  });
}

async function validarConflitoDeHorario(
  profissionalId: number,
  agendamentoId: number,
  novaDataHora: Date,
  duracaoMinutos: number,
) {
  const { rows } = await pool.query(
    `SELECT 1
     FROM agendamentos a
     WHERE a.profissional_id = $1
       AND a.id <> $2
       AND a.status IN ('agendado', 'confirmado')
       AND a.data_hora <
           $3::timestamptz + make_interval(mins => $4::integer)
       AND a.data_hora +
           make_interval(mins => a.duracao_minutos) > $3::timestamptz
     LIMIT 1`,
    [profissionalId, agendamentoId, novaDataHora, duracaoMinutos],
  );

  if (rows.length > 0) {
    throw new AppError('Esse horário entra em conflito com outro agendamento do profissional');
  }
}

export async function reagendarComoAdmin(agendamentoId: number, novaDataHora: Date) {
  return comLockDeAgendamento(agendamentoId, async () => {
    const agendamento = await buscarPorId(agendamentoId);

    if (!['agendado', 'confirmado'].includes(agendamento.status)) {
      throw new AppError('Só é possível reagendar agendamentos ativos');
    }

    return comLockDeProfissional(agendamento.profissional_id, async () => {
      await validarConflitoDeHorario(
        agendamento.profissional_id,
        agendamentoId,
        novaDataHora,
        agendamento.duracao_minutos,
      );

      return withTransaction(async (client) => {
        try {
          const { rows } = await client.query(
            `UPDATE agendamentos
             SET data_hora = $1,
                 lembrete_enviado = false
             WHERE id = $2 AND status = $3
             RETURNING *`,
            [novaDataHora, agendamentoId, agendamento.status],
          );

          if (rows.length === 0) {
            throw new AppError('Agendamento foi alterado por outra operação');
          }
        } catch (error) {
          if (ehViolacaoDeConstraintUnica(error) && error.code === '23505') {
            throw new AppError(
              'Já existe um agendamento nesse exato horário para esse profissional',
            );
          }
          throw error;
        }

        await registrarHistoricoNaTransacao(
          client,
          agendamentoId,
          agendamento.status,
          agendamento.status,
          agendamento.data_hora,
        );
      });
    });
  });
}

async function registrarHistoricoNaTransacao(
  client: import('pg').PoolClient,
  agendamentoId: number,
  statusAnterior: StatusAgendamento,
  statusNovo: StatusAgendamento,
  dataHoraAnterior?: string,
) {
  await client.query(
    `INSERT INTO historico_agendamentos
       (agendamento_id, status_anterior, status_novo, data_hora_anterior)
     VALUES ($1, $2, $3, $4)`,
    [agendamentoId, statusAnterior, statusNovo, dataHoraAnterior ?? null],
  );
}
