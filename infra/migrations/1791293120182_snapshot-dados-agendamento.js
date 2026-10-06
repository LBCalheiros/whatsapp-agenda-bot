exports.up = (pgm) => {
  pgm.addColumns('agendamentos', {
    duracao_minutos: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    preco: {
      type: 'numeric',
    },
  });

  pgm.sql(`
    UPDATE agendamentos a
    SET
      duracao_minutos = s.duracao_minutos,
      preco = s.preco
    FROM servicos s
    WHERE s.id = a.servico_id
  `);

  pgm.sql(`
    ALTER TABLE agendamentos
    ALTER COLUMN duracao_minutos DROP DEFAULT
  `);
};

exports.down = (pgm) => {
  pgm.dropColumns('agendamentos', ['duracao_minutos', 'preco']);
};
