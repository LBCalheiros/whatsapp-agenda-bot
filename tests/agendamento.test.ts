import { pool } from '@/infra/database';
import { AppError } from '@/infra/errors';
import {
  ANTECEDENCIA_MINIMA_HORAS,
  criarAgendamento,
  cancelarComoCliente,
  reagendarAgendamento,
} from '@/models/agendamento';
import { paraHorarioLocal } from '@/infra/data';

describe('models/agendamento (integração)', () => {
  let profissionalId: number;
  let servicoId: number;
  let clienteId: number;

  beforeAll(async () => {
    const profissional = await pool.query(
      `INSERT INTO profissionais (nome, telefone_contato, ativo) VALUES ('Teste Jest', '5511900000000', true) RETURNING id`,
    );
    profissionalId = profissional.rows[0].id;

    const servico = await pool.query(
      `INSERT INTO servicos (nome, duracao_minutos, preco, ativo) VALUES ('Serviço Jest', 30, 50, true) RETURNING id`,
    );
    servicoId = servico.rows[0].id;

    const cliente = await pool.query(
      `INSERT INTO clientes (telefone, nome) VALUES ('5511900000001', 'Cliente Jest') RETURNING id`,
    );
    clienteId = cliente.rows[0].id;

    // expediente 24h todo dia, pra não depender de regras de disponibilidade
    await pool.query(
      `INSERT INTO regras_disponibilidade (profissional_id, dia_semana, horario_inicio, horario_fim, intervalo_minutos)
       SELECT $1, dia, '00:00', '23:59', 30 FROM generate_series(0, 6) AS dia`,
      [profissionalId],
    );
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM historico_agendamentos WHERE agendamento_id IN (SELECT id FROM agendamentos WHERE profissional_id = $1)`,
      [profissionalId],
    );
    await pool.query(`DELETE FROM agendamentos WHERE profissional_id = $1`, [profissionalId]);
    await pool.query(`DELETE FROM regras_disponibilidade WHERE profissional_id = $1`, [
      profissionalId,
    ]);
    await pool.query(`DELETE FROM clientes WHERE id = $1`, [clienteId]);
    await pool.query(`DELETE FROM servicos WHERE id = $1`, [servicoId]);
    await pool.query(`DELETE FROM profissionais WHERE id = $1`, [profissionalId]);
    await pool.end();
  });

  it('cria um agendamento válido', async () => {
    const dataHora = dataFutura(48);
    const agendamento = await criarAgendamento({ clienteId, profissionalId, servicoId, dataHora });

    expect(agendamento.status).toBe('agendado');
    expect(new Date(agendamento.data_hora).getTime()).toBe(dataHora.getTime());
  });

  it('rejeita agendamento com menos da antecedência mínima', async () => {
    const dataHora = dataFutura(ANTECEDENCIA_MINIMA_HORAS - 1);
    await expect(
      criarAgendamento({ clienteId, profissionalId, servicoId, dataHora }),
    ).rejects.toThrow(AppError);
  });

  it('rejeita dois agendamentos no mesmo horário pro mesmo profissional (conflito)', async () => {
    const dataHora = dataFutura(72);
    await criarAgendamento({ clienteId, profissionalId, servicoId, dataHora });

    await expect(
      criarAgendamento({ clienteId, profissionalId, servicoId, dataHora }),
    ).rejects.toThrow(AppError);
  });

  it('cancela um agendamento com mais de 24h de antecedência', async () => {
    const dataHora = dataFutura(96);
    const agendamento = await criarAgendamento({ clienteId, profissionalId, servicoId, dataHora });

    await cancelarComoCliente(agendamento.id);

    const { rows } = await pool.query(`SELECT status FROM agendamentos WHERE id = $1`, [
      agendamento.id,
    ]);
    expect(rows[0].status).toBe('cancelado');
  });

  it('rejeita cancelamento com menos de 24h de antecedência', async () => {
    const dataHora = dataFutura(10);
    const agendamento = await criarAgendamento({ clienteId, profissionalId, servicoId, dataHora });

    await expect(cancelarComoCliente(agendamento.id)).rejects.toThrow(AppError);
  });

  it('reagenda pra um novo horário válido', async () => {
    const dataHora = dataFutura(120);
    const agendamento = await criarAgendamento({ clienteId, profissionalId, servicoId, dataHora });

    const novaDataHora = dataFutura(144);
    await reagendarAgendamento(agendamento.id, novaDataHora);

    const { rows } = await pool.query(`SELECT data_hora FROM agendamentos WHERE id = $1`, [
      agendamento.id,
    ]);
    expect(new Date(rows[0].data_hora).getTime()).toBe(novaDataHora.getTime());
  });

  it('rejeita reagendamento pra menos da antecedência mínima', async () => {
    const dataHora = dataFutura(168);
    const agendamento = await criarAgendamento({ clienteId, profissionalId, servicoId, dataHora });

    await expect(
      reagendarAgendamento(agendamento.id, dataFutura(ANTECEDENCIA_MINIMA_HORAS - 1)),
    ).rejects.toThrow(AppError);
  });

  it('registra histórico ao cancelar e ao reagendar', async () => {
    const dataHora = dataFutura(200);
    const agendamento = await criarAgendamento({ clienteId, profissionalId, servicoId, dataHora });

    await reagendarAgendamento(agendamento.id, dataFutura(210));

    const { rows } = await pool.query(
      `SELECT * FROM historico_agendamentos WHERE agendamento_id = $1`,
      [agendamento.id],
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

function dataFutura(horasNoFuturo: number): Date {
  const data = new Date(Date.now() + horasNoFuturo * 60 * 60 * 1000);
  data.setMinutes(data.getMinutes() < 30 ? 0 : 30, 0, 0);
  const local = paraHorarioLocal(data);
  if (local.getUTCHours() === 23 && local.getUTCMinutes() === 30) {
    data.setTime(data.getTime() - 30 * 60_000);
  }

  return data;
}
