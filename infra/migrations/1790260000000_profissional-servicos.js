exports.up = (pgm) => {
  pgm.createTable('profissional_servicos', {
    profissional_id: {
      type: 'integer',
      notNull: true,
      references: 'profissionais',
      onDelete: 'cascade',
    },
    servico_id: {
      type: 'integer',
      notNull: true,
      references: 'servicos',
      onDelete: 'cascade',
    },
  });
  pgm.addConstraint('profissional_servicos', 'profissional_servicos_pkey', {
    primaryKey: ['profissional_id', 'servico_id'],
  });

  // preserva o comportamento de hoje ("qualquer profissional faz qualquer
  // serviço") pra tudo que já existe — a restrição por vínculo só passa a
  // valer de verdade daqui pra frente, em profissionais/serviços novos ou em
  // edições explícitas feitas pela tela
  pgm.sql(`
    INSERT INTO profissional_servicos (profissional_id, servico_id)
    SELECT p.id, s.id FROM profissionais p CROSS JOIN servicos s
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('profissional_servicos');
};
