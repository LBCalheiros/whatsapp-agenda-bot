exports.up = (pgm) => {
  pgm.addColumn('usuarios_admin', {
    profissional_id: {
      type: 'integer',
      references: 'profissionais',
      onDelete: 'set null',
    },
    ativo: { type: 'boolean', notNull: true, default: true },
  });

  // quem já existia nasceu com o role genérico 'admin' — vira 'gerente' (mantém acesso total)
  pgm.sql(`UPDATE usuarios_admin SET role = 'gerente' WHERE role = 'admin'`);

  pgm.addConstraint('usuarios_admin', 'usuarios_admin_role_check', {
    check: "role IN ('gerente', 'funcionario')",
  });

  // novos funcionários criados sem role explícito (fallback) nascem sem privilégio de gerente
  pgm.alterColumn('usuarios_admin', 'role', { default: 'funcionario' });
};

exports.down = (pgm) => {
  pgm.alterColumn('usuarios_admin', 'role', { default: 'admin' });
  pgm.dropConstraint('usuarios_admin', 'usuarios_admin_role_check');
  pgm.sql(`UPDATE usuarios_admin SET role = 'admin' WHERE role = 'gerente'`);
  pgm.dropColumn('usuarios_admin', 'ativo');
  pgm.dropColumn('usuarios_admin', 'profissional_id');
};
