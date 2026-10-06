exports.up = (pgm) => {
  pgm.dropConstraint('agendamentos', 'agendamentos_profissional_horario_unique');

  pgm.sql(`
    CREATE UNIQUE INDEX agendamentos_profissional_horario_unique
    ON agendamentos (profissional_id, data_hora)
    WHERE status IN ('agendado', 'confirmado');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS agendamentos_profissional_horario_unique;
  `);

  pgm.addConstraint('agendamentos', 'agendamentos_profissional_horario_unique', {
    unique: ['profissional_id', 'data_hora'],
  });
};
