/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('clientes', {
    id: 'id',
    telefone: { type: 'text', notNull: true, unique: true },
    nome: { type: 'text' },
    criado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('profissionais', {
    id: 'id',
    nome: { type: 'text', notNull: true },
    telefone_contato: { type: 'text' },
    ativo: { type: 'boolean', notNull: true, default: true },
    criado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('servicos', {
    id: 'id',
    nome: { type: 'text', notNull: true },
    duracao_minutos: { type: 'integer', notNull: true },
    preco: { type: 'numeric(10,2)' },
    ativo: { type: 'boolean', notNull: true, default: true },
  });

  pgm.createTable('regras_disponibilidade', {
    id: 'id',
    profissional_id: {
      type: 'integer',
      notNull: true,
      references: 'profissionais',
      onDelete: 'cascade',
    },
    dia_semana: { type: 'smallint', notNull: true },
    horario_inicio: { type: 'time', notNull: true },
    horario_fim: { type: 'time', notNull: true },
    intervalo_minutos: { type: 'integer', notNull: true, default: 30 },
  });
  pgm.createIndex('regras_disponibilidade', 'profissional_id');

  pgm.createTable('indisponibilidades', {
    id: 'id',
    profissional_id: {
      type: 'integer',
      notNull: true,
      references: 'profissionais',
      onDelete: 'cascade',
    },
    inicio: { type: 'timestamptz', notNull: true },
    fim: { type: 'timestamptz', notNull: true },
    motivo: { type: 'text' },
  });
  pgm.createIndex('indisponibilidades', 'profissional_id');

  pgm.createTable('agendamentos', {
    id: 'id',
    cliente_id: { type: 'integer', notNull: true, references: 'clientes' },
    profissional_id: { type: 'integer', notNull: true, references: 'profissionais' },
    servico_id: { type: 'integer', notNull: true, references: 'servicos' },
    data_hora: { type: 'timestamptz', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      default: 'agendado',
      check: "status IN ('agendado', 'confirmado', 'cancelado', 'completo', 'nao_compareceu')",
    },
    lembrete_enviado: { type: 'boolean', notNull: true, default: false },
    criado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('agendamentos', 'agendamentos_profissional_horario_unique', {
    unique: ['profissional_id', 'data_hora'],
  });

  pgm.createIndex('agendamentos', 'cliente_id');

  pgm.createTable('historico_agendamentos', {
    id: 'id',
    agendamento_id: {
      type: 'integer',
      notNull: true,
      references: 'agendamentos',
      onDelete: 'cascade',
    },
    status_anterior: { type: 'text' },
    status_novo: { type: 'text', notNull: true },
    data_hora_anterior: { type: 'timestamptz' },
    alterado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('historico_agendamentos', 'agendamento_id');
};

export const down = (pgm) => {
  pgm.dropTable('historico_agendamentos');
  pgm.dropTable('agendamentos');
  pgm.dropTable('indisponibilidades');
  pgm.dropTable('regras_disponibilidade');
  pgm.dropTable('servicos');
  pgm.dropTable('profissionais');
  pgm.dropTable('clientes');
};
