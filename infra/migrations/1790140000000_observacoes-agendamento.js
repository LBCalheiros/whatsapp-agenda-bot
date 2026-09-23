exports.up = (pgm) => {
  pgm.addColumn('agendamentos', {
    observacoes: { type: 'text' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('agendamentos', 'observacoes');
};
