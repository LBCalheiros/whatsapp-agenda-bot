# WhatsApp Agenda Bot

Sistema de agendamento de serviços integrado à WhatsApp Cloud API, com atendimento conversacional pelo WhatsApp e painel administrativo para gestão da agenda.

O projeto foi desenvolvido como estudo prático de backend, banco de dados, integração com API externa, concorrência e construção de uma interface administrativa.

## Funcionalidades

### Atendimento pelo WhatsApp

- Recebimento e validação de webhooks da WhatsApp Cloud API.
- Menu conversacional com estado persistido no PostgreSQL.
- Agendamento de serviços com escolha de horário.
- Confirmação de agendamento por mensagem interativa.
- Consulta e cancelamento de agendamentos.
- Fluxo para falar com um atendente.
- Mensagens de texto, botões interativos e templates.
- Proteção contra processamento duplicado de mensagens da Meta.
- Retry automático para falhas temporárias da API do WhatsApp.

### Painel administrativo

O painel protegido permite gerenciar:

- Agenda e agendamentos.
- Profissionais.
- Serviços.
- Funcionários e permissões.
- Regras de disponibilidade.
- Bloqueios de horários.
- Atendimentos humanos.
- Observações dos agendamentos.
- Receita por período.
- Configurações de antecedência mínima.

O sistema suporta múltiplos profissionais e permite definir quais serviços cada profissional atende.

### Regras de agendamento

- Antecedência mínima configurável por profissional.
- Controle de expediente e intervalos entre horários.
- Bloqueios de disponibilidade.
- Prevenção de conflitos por sobreposição de horários.
- Apenas agendamentos `agendado` e `confirmado` ocupam horários.
- Agendamentos `completo`, `cancelado` e `nao_compareceu` liberam o horário.
- Cancelamento pelo cliente com antecedência mínima de 24 horas.
- Reagendamento administrativo sem aplicar a antecedência mínima do cliente.
- Conclusão automática de agendamentos depois do término do serviço.
- Histórico das alterações de status e reagendamentos.

### Consistência e concorrência

O projeto utiliza recursos do PostgreSQL para lidar com concorrência de forma segura:

- Advisory locks por profissional para serializar operações de agenda.
- Advisory locks por agendamento para operações concorrentes sobre o mesmo registro.
- Advisory locks por conversa para evitar processamento simultâneo de mensagens do mesmo telefone.
- Constraint e índice único para impedir duplicidade de horário entre agendamentos ativos.
- Idempotência para mensagens recebidas da Meta.
- Snapshot de duração e preço no momento da criação do agendamento, evitando que alterações posteriores no serviço modifiquem o histórico.

## Stack

- Next.js 16 com App Router
- TypeScript
- React
- PostgreSQL 16
- `pg`
- `node-pg-migrate`
- WhatsApp Cloud API
- Zod
- Pino
- Jest e `ts-jest`
- Docker Compose
- Tailwind CSS

## Arquitetura

```text
WhatsApp / Painel
       |
       v
   app/api/
   Camada HTTP
       |
       v
    models/
  Regras de domínio
       |
       v
    infra/
Banco, autenticação,
locks, integração WhatsApp
       |
       v
  PostgreSQL
```

Principais responsabilidades:

```text
app/api/       Rotas HTTP, autenticação e adaptação das requisições
app/painel/    Interface administrativa
models/        Regras de negócio e acesso aos dados do domínio
infra/         Banco, migrations, sessões, locks, logs e WhatsApp
lib/           Utilitários usados pelo frontend
hooks/         Hooks para consumo e atualização das APIs
tests/         Testes automatizados
```

O webhook recebe o evento da Meta e delega o processamento para a camada de domínio. O estado da conversa é persistido no PostgreSQL, evitando dependência da memória de uma instância específica do Next.js.

## Fluxo de agendamento

```text
Cliente
  |
  v
WhatsApp
  |
  v
Webhook
  |
  v
Conversa persistida
  |
  +--> Agendar
  |      |
  |      +--> Escolher serviço
  |      +--> Consultar horários
  |      +--> Escolher horário
  |      +--> Confirmar
  |      +--> Criar agendamento
  |
  +--> Ver agendamentos
  |
  +--> Falar com atendente
```

## Banco de dados

O PostgreSQL armazena, entre outros dados:

- clientes
- profissionais
- serviços
- relação entre profissionais e serviços
- regras de disponibilidade
- indisponibilidades
- agendamentos
- histórico de agendamentos
- conversas
- atendimentos humanos
- mensagens de atendimento
- usuários administrativos
- mensagens do WhatsApp já processadas

A relação `profissional_servicos` permite que um serviço seja oferecido por vários profissionais e que cada profissional tenha seu próprio conjunto de serviços.

## Autenticação e autorização

O painel utiliza sessão assinada por HMAC armazenada em cookie.

A sessão contém a versão do token do usuário. Alterações sensíveis, como senha ou papel, podem invalidar sessões anteriores por meio dessa versão.

Existem dois papéis:

- `gerente`: acesso administrativo completo.
- `funcionario`: acesso limitado ao próprio perfil e ao profissional ao qual está vinculado.

As rotas administrativas verificam a sessão e, quando aplicável, o profissional autorizado antes de acessar ou alterar dados.

## Jobs automáticos

Existem rotas protegidas por `CRON_SECRET` para tarefas automáticas:

```text
/api/cron/lembretes
/api/cron/manutencao
```

O cron de lembretes procura agendamentos que precisam receber o lembrete e evita envio duplicado.

O cron de manutenção conclui automaticamente agendamentos cujo horário já terminou, usando a duração armazenada como snapshot no próprio agendamento.

Em produção, essas rotas podem ser executadas por um scheduler externo, como o Vercel Cron configurado no projeto.

## Configuração local

### Pré-requisitos

- Node.js
- Docker
- Conta/configuração da WhatsApp Cloud API para uso da integração real

### Instalação

```bash
npm install
```

Crie o arquivo de ambiente:

```bash
cp .env.example .env.development
```

Preencha as variáveis necessárias:

```env
DATABASE_URL=

WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

CRON_SECRET=
AUTH_SECRET=
```

Suba o PostgreSQL:

```bash
npm run services:up
```

Execute as migrations:

```bash
npm run migration:up
```

Inicie a aplicação:

```bash
npm run dev
```

Por padrão, a aplicação local fica disponível em:

```text
http://localhost:3000
```

O painel administrativo fica em:

```text
/painel/login
```

### Desenvolvimento com GitHub Codespaces

Para receber requisições externas durante testes de webhook, a porta `3000` precisa estar pública no Codespaces. A porta do PostgreSQL deve permanecer privada.

## Comandos

| Comando                                              | Descrição                                                 |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `npm run dev`                                        | Inicia o PostgreSQL e a aplicação em modo desenvolvimento |
| `npm run services:up`                                | Sobe os serviços locais                                   |
| `npm run services:down`                              | Para e remove os serviços locais                          |
| `npm run migration:up`                               | Executa migrations pendentes                              |
| `npm run migration:create -- <nome>`                 | Cria uma nova migration                                   |
| `npm test`                                           | Executa toda a suíte de testes                            |
| `npm run lint:check`                                 | Executa ESLint e verifica formatação                      |
| `npm run lint:fix`                                   | Corrige lint e formatação                                 |
| `npx tsc --noEmit`                                   | Verifica os tipos TypeScript                              |
| `npm run build`                                      | Gera o build de produção                                  |
| `npm run postgres`                                   | Abre o `psql` no PostgreSQL local                         |
| `npm run admin:criar -- <email> <senha> [telefone]`  | Cria um usuário administrativo                            |
| `npm run admin:resetar-senha -- <email> <novaSenha>` | Redefine a senha de um usuário                            |
| `npm run admin:listar`                               | Lista usuários administrativos                            |

## Testes

Os testes ficam em `tests/` e cobrem diferentes partes da aplicação, incluindo:

- Regras de agendamento.
- Concorrência e conflitos de horário.
- Snapshot de duração e preço.
- Conclusão automática.
- CRUD de profissionais.
- Autorização por profissional.
- Sessões e autenticação.
- Hash e verificação de senhas.
- Assinatura do webhook.
- Idempotência de mensagens do WhatsApp.
- Retry da integração com a WhatsApp Cloud API.
- Conversas concorrentes.

A suíte atual conta com **57 testes automatizados**.

Para executar apenas uma suíte:

```bash
npm test -- --runInBand tests/agendamento.test.ts
```

## Validação do projeto

Antes de considerar uma alteração pronta, a validação completa pode ser executada com:

```bash
npm run lint:check
npx tsc --noEmit
npm test
npm run build
```

## Status

O projeto está em desenvolvimento e foi construído como projeto pessoal de estudo.

A implementação atual está validada com:

```text
57 testes passando
TypeScript sem erros
ESLint sem erros
Prettier validado
Build de produção concluído
```

A integração real com a WhatsApp Cloud API depende da configuração das credenciais, webhook e recursos correspondentes na plataforma da Meta.

## Licença

A definir.
