import { pool } from '@/infra/database';
import { criarAgendamentoManual } from '@/models/agendamento';
import { buscarOuCriarClientePorTelefone } from '@/models/cliente';

describe('models/agendamento: criação manual (integração)', () => {
  let profissionalId: number;
  let outroProfissionalId: number;
  let servicoId: number;
  let servicoInativoId: number;

  const TELEFONES = ['5511900000071', '551190000072', '5511900000073'];

  function emHoras(horas: number): Date {
    const data = new Date(Date.now() + horas * 60 * 60 * 1000);
    data.setSeconds(0, 0);
    return data;
  }

  beforeAll(async () => {
    profissionalId = (
      await pool.query(
        `INSERT INTO profissionais (nome, ativo) VALUES ('Manual Jest', true) RETURNING id`,
      )
    ).rows[0].id;

    outroProfissionalId = (
      await pool.query(
        `INSERT INTO profissionais (nome, ativo) VALUES ('Manual Jest sem vínculo', true) RETURNING id`,
      )
    ).rows[0].id;

    servicoId = (
      await pool.query(
        `INSERT INTO servicos (nome, duracao_minutos, preco, ativo)
         VALUES ('Serviço Manual Jest', 30, 70, true) RETURNING id`,
      )
    ).rows[0].id;

    servicoInativoId = (
      await pool.query(
        `INSERT INTO servicos (nome, duracao_minutos, ativo)
         VALUES ('Serviço Manual inativo Jest', 30, false) RETURNING id`,
      )
    ).rows[0].id;

    for (const sid of [servicoId, servicoInativoId]) {
      await pool.query(
        `INSERT INTO profissional_servicos (profissional_id, servico_id) VALUES ($1, $2)`,
        [profissionalId, sid],
      );
    }
    // sem regras de disponibilidade de propósito: o manual não depende delas
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM agendamentos WHERE profissional_id = $1`, [profissionalId]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM agendamentos WHERE profissional_id = $1`, [profissionalId]);
    await pool.query(`DELETE FROM clientes WHERE telefone = ANY($1::text[])`, [
      [...TELEFONES, '5511900000072'],
    ]);
    await pool.query(`DELETE FROM profissional_servicos WHERE profissional_id = $1`, [
      profissionalId,
    ]);
    await pool.query(`DELETE FROM servicos WHERE id = ANY($1::int[])`, [
      [servicoId, servicoInativoId],
    ]);
    await pool.query(`DELETE FROM profissionais WHERE id = ANY($1::int[])`, [
      [profissionalId, outroProfissionalId],
    ]);
    await pool.end();
  });

  it('cria o agendamento com cliente no formato do WhatsApp, sem exigir expediente', async () => {
    const dataHora = emHoras(1);

    const agendamento = await criarAgendamentoManual({
      telefone: '(11) 90000-0071',
      nomeCliente: 'Maria Manual',
      profissionalId,
      servicoId,
      dataHora,
      observacoes: '  traz o filho  ',
    });

    expect(agendamento.status).toBe('agendado');
    expect(agendamento.duracao_minutos).toBe(30);
    expect(Number(agendamento.preco)).toBe(70);
    expect(agendamento.observacoes).toBe('traz o filho');

    const { rows } = await pool.query(`SELECT telefone, nome FROM clientes WHERE id = $1`, [
      agendamento.cliente_id,
    ]);
    expect(rows[0]).toEqual({ telefone: '5511900000071', nome: 'Maria Manual' });
  });

  it('reusa o cliente que já veio pelo bot e não sobrescreve o nome', async () => {
    const existente = await buscarOuCriarClientePorTelefone('5511900000073');
    await pool.query(`UPDATE clientes SET nome = 'Nome do bot' WHERE id = $1`, [existente.id]);

    const agendamento = await criarAgendamentoManual({
      telefone: '+55 (11) 90000-0073',
      nomeCliente: 'Outro nome',
      profissionalId,
      servicoId,
      dataHora: emHoras(2),
    });

    expect(agendamento.cliente_id).toBe(existente.id);

    const { rows } = await pool.query(`SELECT nome FROM clientes WHERE id = $1`, [existente.id]);
    expect(rows[0].nome).toBe('Nome do bot');
  });

  it('reconhece o mesmo celular com e sem o 9º dígito como um cliente só', async () => {
    // o bot recebeu o número sem o 9 (12 dígitos)
    const doBot = await buscarOuCriarClientePorTelefone('551190000072');

    const agendamento = await criarAgendamentoManual({
      telefone: '11 99000-0072',
      profissionalId,
      servicoId,
      dataHora: emHoras(3),
    });

    expect(agendamento.cliente_id).toBe(doBot.id);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS total FROM clientes WHERE telefone IN ('551190000072', '5511900000072')`,
    );
    expect(rows[0].total).toBe(1);
  });

  it('recusa telefone inválido sem criar nada', async () => {
    await expect(
      criarAgendamentoManual({
        telefone: '123',
        profissionalId,
        servicoId,
        dataHora: emHoras(4),
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('Telefone inválido') });
  });

  it('recusa horário no passado', async () => {
    await expect(
      criarAgendamentoManual({
        telefone: '11900000071',
        profissionalId,
        servicoId,
        dataHora: emHoras(-1),
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('futuro') });
  });

  it('recusa sobreposição com outro agendamento ativo do profissional', async () => {
    const dataHora = emHoras(5);

    await criarAgendamentoManual({ telefone: '11900000071', profissionalId, servicoId, dataHora });

    await expect(
      criarAgendamentoManual({
        telefone: '11900000073',
        profissionalId,
        servicoId,
        dataHora: new Date(dataHora.getTime() + 10 * 60_000),
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('conflito') });
  });

  it('libera o horário depois de cancelar o agendamento', async () => {
    const dataHora = emHoras(6);

    const primeiro = await criarAgendamentoManual({
      telefone: '11900000071',
      profissionalId,
      servicoId,
      dataHora,
    });
    await pool.query(`UPDATE agendamentos SET status = 'cancelado' WHERE id = $1`, [primeiro.id]);

    await expect(
      criarAgendamentoManual({ telefone: '11900000073', profissionalId, servicoId, dataHora }),
    ).resolves.toMatchObject({ status: 'agendado' });
  });

  it('recusa profissional que não atende o serviço e serviço desativado', async () => {
    await expect(
      criarAgendamentoManual({
        telefone: '11900000071',
        profissionalId: outroProfissionalId,
        servicoId,
        dataHora: emHoras(7),
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('não atende') });

    await expect(
      criarAgendamentoManual({
        telefone: '11900000071',
        profissionalId,
        servicoId: servicoInativoId,
        dataHora: emHoras(7),
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('desativado') });
  });

  it('não cria cliente quando a regra falha', async () => {
    await expect(
      criarAgendamentoManual({
        telefone: '11 98888-7777',
        profissionalId: outroProfissionalId,
        servicoId,
        dataHora: emHoras(8),
      }),
    ).rejects.toBeDefined();

    const { rows } = await pool.query(
      `SELECT 1 FROM clientes WHERE telefone IN ('5511988887777', '551188887777')`,
    );
    expect(rows).toHaveLength(0);
  });
});
