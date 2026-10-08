import { pool } from '@/infra/database';
import { buscarServicoPorId, criarServico, excluirServico } from '@/models/servico';

describe('models/servico: exclusão (integração)', () => {
  let clienteId: number;
  let profissionalId: number;
  let servicoComAgendamentoId: number;

  beforeAll(async () => {
    const cliente = await pool.query(
      `INSERT INTO clientes (telefone, nome)
       VALUES ('5511900000021', 'Cliente servico Jest')
       RETURNING id`,
    );
    clienteId = cliente.rows[0].id;

    const profissional = await pool.query(
      `INSERT INTO profissionais (nome, telefone_contato, ativo)
       VALUES ('Profissional servico Jest', '5511900000022', true)
       RETURNING id`,
    );
    profissionalId = profissional.rows[0].id;

    const servico = await criarServico({
      nome: 'Serviço com agendamento Jest',
      duracaoMinutos: 30,
    });
    servicoComAgendamentoId = servico.id;

    await pool.query(
      `INSERT INTO agendamentos
       (cliente_id, profissional_id, servico_id, data_hora, duracao_minutos, preco)
       VALUES ($1, $2, $3, now() + interval '5 days', 30, 50)`,
      [clienteId, profissionalId, servicoComAgendamentoId],
    );
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM historico_agendamentos
       WHERE agendamento_id IN (SELECT id FROM agendamentos WHERE cliente_id = $1)`,
      [clienteId],
    );
    await pool.query(`DELETE FROM agendamentos WHERE cliente_id = $1`, [clienteId]);
    await pool.query(`DELETE FROM clientes WHERE id = $1`, [clienteId]);
    await pool.query(`DELETE FROM servicos WHERE id = $1`, [servicoComAgendamentoId]);
    await pool.query(`DELETE FROM profissionais WHERE id = $1`, [profissionalId]);
    await pool.end();
  });

  it('exclui um serviço que nunca foi agendado', async () => {
    const servico = await criarServico({ nome: 'Serviço excluível Jest', duracaoMinutos: 20 });

    await excluirServico(servico.id);

    await expect(buscarServicoPorId(servico.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('não exclui um serviço que possui agendamentos', async () => {
    await expect(excluirServico(servicoComAgendamentoId)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Desative-o'),
    });

    const servico = await buscarServicoPorId(servicoComAgendamentoId);
    expect(servico.nome).toBe('Serviço com agendamento Jest');
  });

  it('retorna 404 ao excluir um serviço que não existe', async () => {
    await expect(excluirServico(999999999)).rejects.toMatchObject({ statusCode: 404 });
  });
});
