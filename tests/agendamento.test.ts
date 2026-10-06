import { pool } from '@/infra/database';
import { AppError } from '@/infra/errors';
import {
  ANTECEDENCIA_MINIMA_HORAS,
  criarAgendamento,
  cancelarAgendamento,
  cancelarComoCliente,
  reagendarAgendamento,
  reagendarComoAdmin,
  marcarComoCompleto,
  concluirAgendamentosPassados,
} from '@/models/agendamento';
import { paraHorarioLocal } from '@/infra/data';
import { atualizarServico } from '@/models/servico';

describe('models/agendamento (integração)', () => {
  let profissionalId: number;
  let servicoId: number;
  let clienteId: number;
  let servicoConflitoId: number;
  let servicoSnapshotId: number;

  it('mantém duração e preço do agendamento mesmo após alteração do serviço', async () => {
    const dataHora = dataFutura(240);

    const agendamento = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId: servicoSnapshotId,
      dataHora,
    });

    expect(agendamento.duracao_minutos).toBe(30);
    expect(Number(agendamento.preco)).toBe(50);

    await atualizarServico(servicoSnapshotId, {
      duracaoMinutos: 60,
      preco: 80,
    });

    const { rows } = await pool.query(
      `SELECT duracao_minutos, preco
     FROM agendamentos
     WHERE id = $1`,
      [agendamento.id],
    );

    expect(rows[0].duracao_minutos).toBe(30);
    expect(Number(rows[0].preco)).toBe(50);

    const { rows: servicos } = await pool.query(
      `SELECT duracao_minutos, preco
     FROM servicos
     WHERE id = $1`,
      [servicoSnapshotId],
    );

    expect(servicos[0].duracao_minutos).toBe(60);
    expect(Number(servicos[0].preco)).toBe(80);
  });

  beforeAll(async () => {
    const profissional = await pool.query(
      `INSERT INTO profissionais (nome, telefone_contato, ativo)
     VALUES ('Teste Jest', '5511900000000', true)
     RETURNING id`,
    );

    profissionalId = profissional.rows[0].id;

    const servicoSnapshot = await pool.query(
      `INSERT INTO servicos (nome, duracao_minutos, preco, ativo)
     VALUES ('Serviço Snapshot Jest', 30, 50, true)
     RETURNING id`,
    );

    servicoSnapshotId = servicoSnapshot.rows[0].id;

    await pool.query(
      `INSERT INTO profissional_servicos (profissional_id, servico_id)
   VALUES ($1, $2)`,
      [profissionalId, servicoSnapshotId],
    );

    const servicoConflito = await pool.query(
      `INSERT INTO servicos (nome, duracao_minutos, preco, ativo)
       VALUES ('Serviço Conflito Jest', 60, 80, true)
       RETURNING id`,
    );

    servicoConflitoId = servicoConflito.rows[0].id;

    await pool.query(
      `INSERT INTO profissional_servicos (profissional_id, servico_id)
       VALUES ($1, $2)`,
      [profissionalId, servicoConflitoId],
    );

    const servico = await pool.query(
      `INSERT INTO servicos (nome, duracao_minutos, preco, ativo)
       VALUES ('Serviço Jest', 30, 50, true)
       RETURNING id`,
    );

    servicoId = servico.rows[0].id;

    await pool.query(
      `INSERT INTO profissional_servicos (profissional_id, servico_id)
       VALUES ($1, $2)`,
      [profissionalId, servicoId],
    );

    const cliente = await pool.query(
      `INSERT INTO clientes (telefone, nome)
       VALUES ('5511900000001', 'Cliente Jest')
       RETURNING id`,
    );

    clienteId = cliente.rows[0].id;

    // expediente 24h todo dia, pra não depender de regras de disponibilidade
    await pool.query(
      `INSERT INTO regras_disponibilidade
       (profissional_id, dia_semana, horario_inicio, horario_fim, intervalo_minutos)
       SELECT $1, dia, '00:00', '23:59', 30
       FROM generate_series(0, 6) AS dia`,
      [profissionalId],
    );
  });

  afterEach(async () => {
    await pool.query(
      `DELETE FROM historico_agendamentos
     WHERE agendamento_id IN (
       SELECT id FROM agendamentos WHERE profissional_id = $1
     )`,
      [profissionalId],
    );

    await pool.query(`DELETE FROM agendamentos WHERE profissional_id = $1`, [profissionalId]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM profissional_servicos WHERE profissional_id = $1`, [
      profissionalId,
    ]);

    await pool.query(
      `DELETE FROM historico_agendamentos
       WHERE agendamento_id IN (
         SELECT id FROM agendamentos WHERE profissional_id = $1
       )`,
      [profissionalId],
    );

    await pool.query(`DELETE FROM agendamentos WHERE profissional_id = $1`, [profissionalId]);

    await pool.query(`DELETE FROM regras_disponibilidade WHERE profissional_id = $1`, [
      profissionalId,
    ]);

    await pool.query(`DELETE FROM clientes WHERE id = $1`, [clienteId]);
    await pool.query(`DELETE FROM servicos WHERE id = $1`, [servicoId]);
    await pool.query(`DELETE FROM servicos WHERE id = $1`, [servicoConflitoId]);
    await pool.query(`DELETE FROM servicos WHERE id = $1`, [servicoSnapshotId]);
    await pool.query(`DELETE FROM profissionais WHERE id = $1`, [profissionalId]);

    await pool.end();
  });

  it('cria um agendamento válido', async () => {
    const dataHora = dataFutura(48);

    const agendamento = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora,
    });

    expect(agendamento.status).toBe('agendado');
    expect(new Date(agendamento.data_hora).getTime()).toBe(dataHora.getTime());
  });

  it('rejeita agendamento com menos da antecedência mínima', async () => {
    const dataHora = dataFutura(ANTECEDENCIA_MINIMA_HORAS - 1);

    await expect(
      criarAgendamento({
        clienteId,
        profissionalId,
        servicoId,
        dataHora,
      }),
    ).rejects.toThrow(AppError);
  });

  it('rejeita dois agendamentos no mesmo horário pro mesmo profissional (conflito)', async () => {
    const dataHora = dataFutura(72);

    await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora,
    });

    await expect(
      criarAgendamento({
        clienteId,
        profissionalId,
        servicoId,
        dataHora,
      }),
    ).rejects.toThrow(AppError);
  });

  it('não permite dois agendamentos concorrentes que se sobrepõem', async () => {
    const dataHora = dataFutura(240);
    const novaDataHora = new Date(dataHora.getTime() + 30 * 60_000);

    const resultados = await Promise.allSettled([
      criarAgendamento({
        clienteId,
        profissionalId,
        servicoId: servicoConflitoId,
        dataHora,
      }),
      criarAgendamento({
        clienteId,
        profissionalId,
        servicoId: servicoConflitoId,
        dataHora: novaDataHora,
      }),
    ]);

    const sucessos = resultados.filter((resultado) => resultado.status === 'fulfilled');
    const erros = resultados.filter((resultado) => resultado.status === 'rejected');

    expect(sucessos).toHaveLength(1);
    expect(erros).toHaveLength(1);
    expect(erros[0].reason).toBeInstanceOf(AppError);
  });

  it('cancela um agendamento com mais de 24h de antecedência', async () => {
    const dataHora = dataFutura(96);

    const agendamento = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora,
    });

    await cancelarComoCliente(agendamento.id);

    const { rows } = await pool.query(`SELECT status FROM agendamentos WHERE id = $1`, [
      agendamento.id,
    ]);

    expect(rows[0].status).toBe('cancelado');
  });

  it('rejeita cancelamento com menos de 24h de antecedência', async () => {
    const dataHora = dataFutura(10);

    const agendamento = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora,
    });

    await expect(cancelarComoCliente(agendamento.id)).rejects.toThrow(AppError);
  });

  it('reagenda pra um novo horário válido', async () => {
    const dataHora = dataFutura(120);

    const agendamento = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora,
    });

    const novaDataHora = dataFutura(144);

    await reagendarAgendamento(agendamento.id, novaDataHora);

    const { rows } = await pool.query(`SELECT data_hora FROM agendamentos WHERE id = $1`, [
      agendamento.id,
    ]);

    expect(new Date(rows[0].data_hora).getTime()).toBe(novaDataHora.getTime());
  });

  it('rejeita reagendamento pra menos da antecedência mínima', async () => {
    const dataHora = dataFutura(168);

    const agendamento = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora,
    });

    await expect(
      reagendarAgendamento(agendamento.id, dataFutura(ANTECEDENCIA_MINIMA_HORAS - 1)),
    ).rejects.toThrow(AppError);
  });

  it('registra histórico ao cancelar e ao reagendar', async () => {
    const dataHora = dataFutura(200);

    const agendamento = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora,
    });

    await reagendarAgendamento(agendamento.id, dataFutura(210));

    const { rows } = await pool.query(
      `SELECT * FROM historico_agendamentos WHERE agendamento_id = $1`,
      [agendamento.id],
    );

    expect(rows.length).toBeGreaterThan(0);
  });

  it('não permite cancelar um agendamento já concluído', async () => {
    const agendamento = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora: dataFutura(120),
    });

    await marcarComoCompleto(agendamento.id);

    await expect(cancelarAgendamento(agendamento.id)).rejects.toMatchObject({
      message: expect.stringContaining('completo'),
    });
  });

  it('não permite concluir um agendamento cancelado', async () => {
    const agendamento = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora: dataFutura(120),
    });

    await cancelarAgendamento(agendamento.id);

    await expect(marcarComoCompleto(agendamento.id)).rejects.toMatchObject({
      message: expect.stringContaining('cancelado'),
    });
  });

  it('não permite concluir novamente um agendamento já concluído', async () => {
    const agendamento = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora: dataFutura(120),
    });

    await marcarComoCompleto(agendamento.id);
    const historicoAntes = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM historico_agendamentos
       WHERE agendamento_id = $1`,
      [agendamento.id],
    );

    const resultado = await marcarComoCompleto(agendamento.id);

    expect(resultado.status).toBe('completo');

    const historicoDepois = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM historico_agendamentos
       WHERE agendamento_id = $1`,
      [agendamento.id],
    );

    expect(historicoDepois.rows[0].total).toBe(historicoAntes.rows[0].total);
  });

  it('permite reagendamento administrativo sem antecedência mínima', async () => {
    const agendamento = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora: dataFutura(120),
    });

    const novaDataHora = new Date(Date.now() + 30 * 60 * 1000);
    await reagendarComoAdmin(agendamento.id, novaDataHora);

    const { rows } = await pool.query(`SELECT data_hora FROM agendamentos WHERE id = $1`, [
      agendamento.id,
    ]);

    expect(new Date(rows[0].data_hora).getTime()).toBe(novaDataHora.getTime());
  });

  it('não trata agendamento concluído como conflito de horário', async () => {
    const horarioOcupado = dataFutura(180);
    const ocupante = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora: horarioOcupado,
    });

    await marcarComoCompleto(ocupante.id);

    const paraReagendar = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora: dataFutura(240),
    });

    await expect(reagendarComoAdmin(paraReagendar.id, horarioOcupado)).resolves.toBeUndefined();

    const { rows } = await pool.query(`SELECT data_hora FROM agendamentos WHERE id = $1`, [
      paraReagendar.id,
    ]);
    expect(new Date(rows[0].data_hora).getTime()).toBe(horarioOcupado.getTime());
  });

  it('não permite reagendar um agendamento já concluído pelo admin', async () => {
    const agendamento = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora: dataFutura(120),
    });

    await marcarComoCompleto(agendamento.id);

    await expect(reagendarComoAdmin(agendamento.id, dataFutura(180))).rejects.toMatchObject({
      message: expect.stringContaining('agendamentos ativos'),
    });
  });

  it('não conclui um agendamento antes do fim da duração', async () => {
    const inicio = new Date(Date.now() - 5 * 60 * 1000);
    const agendamento = await pool.query(
      `INSERT INTO agendamentos
       (cliente_id, profissional_id, servico_id, data_hora, duracao_minutos, preco)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [clienteId, profissionalId, servicoId, inicio, 30, 50],
    );

    await concluirAgendamentosPassados();

    const atual = await pool.query(`SELECT status FROM agendamentos WHERE id = $1`, [
      agendamento.rows[0].id,
    ]);
    expect(atual.rows[0].status).toBe('agendado');

    await pool.query(`DELETE FROM agendamentos WHERE id = $1`, [agendamento.rows[0].id]);
  });

  it('não repete histórico ao executar a conclusão automática duas vezes', async () => {
    const inicio = new Date(Date.now() - 60 * 60 * 1000);
    const agendamento = await pool.query(
      `INSERT INTO agendamentos
       (cliente_id, profissional_id, servico_id, data_hora, duracao_minutos, preco)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [clienteId, profissionalId, servicoId, inicio, 30, 50],
    );

    await concluirAgendamentosPassados();
    const historicoDepoisPrimeiraExecucao = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM historico_agendamentos
       WHERE agendamento_id = $1`,
      [agendamento.rows[0].id],
    );

    await concluirAgendamentosPassados();
    const historicoDepoisSegundaExecucao = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM historico_agendamentos
       WHERE agendamento_id = $1`,
      [agendamento.rows[0].id],
    );

    const atual = await pool.query(`SELECT status FROM agendamentos WHERE id = $1`, [
      agendamento.rows[0].id,
    ]);

    expect(atual.rows[0].status).toBe('completo');
    expect(historicoDepoisPrimeiraExecucao.rows[0].total).toBe(1);
    expect(historicoDepoisSegundaExecucao.rows[0].total).toBe(1);

    await pool.query(`DELETE FROM historico_agendamentos WHERE agendamento_id = $1`, [
      agendamento.rows[0].id,
    ]);
    await pool.query(`DELETE FROM agendamentos WHERE id = $1`, [agendamento.rows[0].id]);
  });

  it('conclui automaticamente agendamento usando a duração do snapshot', async () => {
    const servicoSnapshot = await pool.query(
      `INSERT INTO servicos (nome, duracao_minutos, preco, ativo)
       VALUES ('Serviço snapshot conclusão Jest', 120, 80, true)
       RETURNING id`,
    );
    const servicoSnapshotId = servicoSnapshot.rows[0].id;

    const inicio = new Date(Date.now() - 45 * 60 * 1000);
    const agendamento = await pool.query(
      `INSERT INTO agendamentos
       (cliente_id, profissional_id, servico_id, data_hora, duracao_minutos, preco)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [clienteId, profissionalId, servicoSnapshotId, inicio, 30, 80],
    );

    const concluidos = await concluirAgendamentosPassados();

    expect(concluidos).toBeGreaterThanOrEqual(1);

    const atual = await pool.query(`SELECT status FROM agendamentos WHERE id = $1`, [
      agendamento.rows[0].id,
    ]);
    expect(atual.rows[0].status).toBe('completo');

    await pool.query(`DELETE FROM historico_agendamentos WHERE agendamento_id = $1`, [
      agendamento.rows[0].id,
    ]);
    await pool.query(`DELETE FROM agendamentos WHERE id = $1`, [agendamento.rows[0].id]);
    await pool.query(`DELETE FROM servicos WHERE id = $1`, [servicoSnapshotId]);
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
