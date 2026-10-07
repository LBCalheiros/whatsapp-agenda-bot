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
  marcarComoNaoCompareceu,
  listarAgendamentos,
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

  async function inserirAgendamentoPassado(minutosAtras: number): Promise<number> {
    const inicio = new Date(Date.now() - minutosAtras * 60 * 1000);
    const { rows } = await pool.query(
      `INSERT INTO agendamentos
       (cliente_id, profissional_id, servico_id, data_hora, duracao_minutos, preco)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [clienteId, profissionalId, servicoId, inicio, 30, 50],
    );
    return rows[0].id;
  }

  async function limparAgendamento(id: number) {
    await pool.query(`DELETE FROM historico_agendamentos WHERE agendamento_id = $1`, [id]);
    await pool.query(`DELETE FROM agendamentos WHERE id = $1`, [id]);
  }

  it('marca como não compareceu depois do horário e registra histórico', async () => {
    const id = await inserirAgendamentoPassado(10);

    const resultado = await marcarComoNaoCompareceu(id);

    expect(resultado.status).toBe('nao_compareceu');

    const historico = await pool.query(
      `SELECT status_anterior, status_novo FROM historico_agendamentos WHERE agendamento_id = $1`,
      [id],
    );
    expect(historico.rows).toEqual([
      { status_anterior: 'agendado', status_novo: 'nao_compareceu' },
    ]);

    await limparAgendamento(id);
  });

  it('não permite marcar não compareceu antes do horário', async () => {
    const agendamento = await criarAgendamento({
      clienteId,
      profissionalId,
      servicoId,
      dataHora: dataFutura(120),
    });

    await expect(marcarComoNaoCompareceu(agendamento.id)).rejects.toMatchObject({
      message: expect.stringContaining('depois do horário'),
    });
  });

  it('não repete histórico ao marcar não compareceu duas vezes', async () => {
    const id = await inserirAgendamentoPassado(10);

    await marcarComoNaoCompareceu(id);
    await marcarComoNaoCompareceu(id);

    const historico = await pool.query(
      `SELECT COUNT(*)::int AS total FROM historico_agendamentos WHERE agendamento_id = $1`,
      [id],
    );
    expect(historico.rows[0].total).toBe(1);

    await limparAgendamento(id);
  });

  it('não permite marcar não compareceu em agendamento cancelado ou concluído', async () => {
    const cancelado = await inserirAgendamentoPassado(20);
    await cancelarAgendamento(cancelado);
    await expect(marcarComoNaoCompareceu(cancelado)).rejects.toMatchObject({
      message: expect.stringContaining('cancelado'),
    });

    const concluido = await inserirAgendamentoPassado(30);
    await marcarComoCompleto(concluido);
    await expect(marcarComoNaoCompareceu(concluido)).rejects.toMatchObject({
      message: expect.stringContaining('completo'),
    });

    await limparAgendamento(cancelado);
    await limparAgendamento(concluido);
  });

  it('lista agendamento ativo já passado só com incluirAtivosPassados', async () => {
    const id = await inserirAgendamentoPassado(60);

    const semFlag = await listarAgendamentos({ apenasFuturos: true });
    const comFlag = await listarAgendamentos({ apenasFuturos: true, incluirAtivosPassados: true });

    expect(semFlag.some((a) => a.id === id)).toBe(false);
    expect(comFlag.some((a) => a.id === id)).toBe(true);

    await marcarComoNaoCompareceu(id);
    const depois = await listarAgendamentos({ apenasFuturos: true, incluirAtivosPassados: true });
    expect(depois.some((a) => a.id === id)).toBe(false);

    await limparAgendamento(id);
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
