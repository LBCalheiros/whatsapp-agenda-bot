exports.up = (pgm) => {
  // Rede de segurança só pra banco novo (ambiente recriado do zero) nunca ficar
  // sem nenhum profissional — não substitui o CRUD, é só pra não travar de novo
  // o jeito que travou quando as migrations foram recriadas sem esse dado.
  // Não faz nada se já existir algum profissional (qualquer status).
  pgm.sql(`
    INSERT INTO profissionais (nome, telefone_contato, ativo)
    SELECT 'Profissional padrão', NULL, true
    WHERE NOT EXISTS (SELECT 1 FROM profissionais)
  `);
};

exports.down = () => {
  // Não desfaz o seed de propósito: se você já tem agendamentos/disponibilidade
  // presos nesse profissional, apagar ele no down quebraria isso. Remover
  // manualmente se for mesmo necessário.
};
