import { pool } from '@/infra/database';
import { excluirProfissional } from '@/models/profissional';

describe('models/profissional (integração)', () => {
  let profissionalExcluivelId: number;
  let profissionalComAgendamentoId: number;
  let profissionalApoioId: number;
  let servicoId: number;
  let clienteId: number;

  beforeAll(async () => {
    const apoio = await pool.query(
      `INSERT INTO profissionais (nome, telefone_contato, ativo)
       VALUES ('Profissional apoio Jest', '5511900000011', true)
       RETURNING id`,
    );
    profissionalApoioId = apoio.rows[0].id;

    const excluivel = await pool.query(
      `INSERT INTO profissionais (nome, telefone_contato, ativo)
       VALUES ('Profissional excluível Jest', '5511900000012', true)
       RETURNING id`,
    );
    profissionalExcluivelId = excluivel.rows[0].id;

    const comAgendamento = await pool.query(
      `INSERT INTO profissionais (nome, telefone_contato, ativo)
       VALUES ('Profissional com agendamento Jest', '5511900000013', true)
       RETURNING id`,
    );
    profissionalComAgendamentoId = comAgendamento.rows[0].id;

    const servico = await pool.query(
      `INSERT INTO servicos (nome, duracao_minutos, preco, ativo)
       VALUES ('Serviço profissional Jest', 30, 50, true)
       RETURNING id`,
    );
    servicoId = servico.rows[0].id;

    const cliente = await pool.query(
      `INSERT INTO clientes (telefone, nome)
       VALUES ('5511900000014', 'Cliente profissional Jest')
       RETURNING id`,
    );
    clienteId = cliente.rows[0].id;

    await pool.query(
      `INSERT INTO agendamentos
       (cliente_id, profissional_id, servico_id, data_hora, duracao_minutos, preco)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        clienteId,
        profissionalComAgendamentoId,
        servicoId,
        new Date(Date.now() + 48 * 60 * 60 * 1000),
        30,
        50,
      ],
    );
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM historico_agendamentos
       WHERE agendamento_id IN (
         SELECT id FROM agendamentos WHERE profissional_id = $1
       )`,
      [profissionalComAgendamentoId],
    );
    await pool.query(`DELETE FROM agendamentos WHERE profissional_id = $1`, [
      profissionalComAgendamentoId,
    ]);
    await pool.query(`DELETE FROM clientes WHERE id = $1`, [clienteId]);
    await pool.query(`DELETE FROM servicos WHERE id = $1`, [servicoId]);
    await pool.query(`DELETE FROM profissionais WHERE id IN ($1, $2)`, [
      profissionalComAgendamentoId,
      profissionalApoioId,
    ]);
    await pool.end();
  });

  it('exclui profissional sem agendamentos', async () => {
    await excluirProfissional(profissionalExcluivelId);

    const { rows } = await pool.query(`SELECT id FROM profissionais WHERE id = $1`, [
      profissionalExcluivelId,
    ]);

    expect(rows).toHaveLength(0);
  });

  it('impede exclusão de profissional com agendamentos', async () => {
    await expect(excluirProfissional(profissionalComAgendamentoId)).rejects.toMatchObject({
      message: expect.stringContaining('possui agendamentos'),
      statusCode: 409,
    });
  });
});
