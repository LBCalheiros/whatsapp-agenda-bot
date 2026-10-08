exports.up = (pgm) => {
  pgm.createTable('configuracoes_empresa', {
    id: { type: 'integer', primaryKey: true, default: 1 },
    nome: { type: 'text' },
    telefone: { type: 'text' },
    endereco: { type: 'text' },
    mensagem_inicial: { type: 'text' },
    mensagem_confirmacao: { type: 'text' },
    mensagem_encerramento: { type: 'text' },
    atualizado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // tabela de linha única: a empresa é uma só
  pgm.addConstraint('configuracoes_empresa', 'configuracoes_empresa_linha_unica', {
    check: 'id = 1',
  });

  pgm.sql(`INSERT INTO configuracoes_empresa (id) VALUES (1);`);
};

exports.down = (pgm) => {
  pgm.dropTable('configuracoes_empresa');
};
