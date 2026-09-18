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
  pgm.createTable('conversas_atendimento', {
    id: 'id',
    cliente_id: {
      type: 'integer',
      notNull: true,
      references: 'clientes',
      onDelete: 'cascade',
    },
    agendamento_id: {
      type: 'integer',
      references: 'agendamentos',
      onDelete: 'set null',
    },
    funcionario_id: {
      type: 'integer',
      references: 'usuarios_admin',
      onDelete: 'set null',
    },
    status: {
      type: 'text',
      notNull: true,
      default: 'aguardando_humano',
      check: "status IN ('bot_ativo', 'aguardando_humano', 'humano_ativo', 'encerrado')",
    },
    criado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    atualizado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('conversas_atendimento', 'cliente_id');
  pgm.createIndex('conversas_atendimento', 'status');

  pgm.createTable('mensagens_atendimento', {
    id: 'id',
    conversa_atendimento_id: {
      type: 'integer',
      notNull: true,
      references: 'conversas_atendimento',
      onDelete: 'cascade',
    },
    remetente: {
      type: 'text',
      notNull: true,
      check: "remetente IN ('cliente', 'funcionario')",
    },
    texto: { type: 'text', notNull: true },
    criado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('mensagens_atendimento', 'conversa_atendimento_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('mensagens_atendimento');
  pgm.dropTable('conversas_atendimento');
};
