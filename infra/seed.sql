INSERT INTO profissionais (nome, telefone_contato)
VALUES ('Ana Souza', '5511988887777')
RETURNING id \gset profissional_

INSERT INTO servicos (nome, duracao_minutos, preco)
VALUES ('Corte de cabelo', 30, 50.00)
RETURNING id \gset servico_

INSERT INTO clientes (telefone, nome)
VALUES ('5511999998888', 'Cliente Teste')
RETURNING id \gset cliente_

-- expediente 9h às 18h, todos os dias da semana, pra não depender de qual dia você testar
INSERT INTO regras_disponibilidade (profissional_id, dia_semana, horario_inicio, horario_fim, intervalo_minutos)
SELECT :profissional_id, dia, '09:00', '18:00', 30
FROM generate_series(0, 6) AS dia;

\echo 'Seed concluído:'
\echo 'profissional_id =' :profissional_id
\echo 'servico_id =' :servico_id
\echo 'cliente_id =' :cliente_id
