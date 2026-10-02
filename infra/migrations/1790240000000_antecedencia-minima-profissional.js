exports.up = (pgm) => {
  pgm.addColumn('profissionais', {
    antecedencia_minima_horas: { type: 'integer', notNull: true, default: 2 },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('profissionais', 'antecedencia_minima_horas');
};
