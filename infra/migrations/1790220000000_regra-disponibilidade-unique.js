exports.up = (pgm) => {
  pgm.addConstraint('regras_disponibilidade', 'regras_disponibilidade_profissional_dia_unique', {
    unique: ['profissional_id', 'dia_semana'],
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('regras_disponibilidade', 'regras_disponibilidade_profissional_dia_unique');
};
