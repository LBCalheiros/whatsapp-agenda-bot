# WhatsApp Agenda Bot

Bot de WhatsApp para agendamento de serviços. O projeto recebe mensagens pela WhatsApp Cloud API, mantém o estado da conversa no PostgreSQL e permite consultar horários, confirmar agendamentos e cancelar compromissos dentro das regras definidas.

> Projeto pessoal/em desenvolvimento, voltado a estudo. Ainda não está preparado para produção.

## Funcionalidades atuais

- Verificação e recebimento de webhooks da WhatsApp Cloud API.
- Menu conversacional com estado persistido por telefone.
- Consulta de horários, confirmação e criação de agendamentos.
- Consulta e cancelamento de agendamentos futuros.
- Mensagens de texto, botões interativos e templates pela Cloud API.

Neste MVP, o fluxo de agendamento usa o primeiro profissional e o primeiro serviço ativos cadastrados. O cliente que possui mais de um agendamento futuro é direcionado ao atendimento para cancelamento.

## Stack

- Next.js 16 (App Router) e TypeScript
- PostgreSQL 16, `pg` e `node-pg-migrate`
- WhatsApp Cloud API
- Pino para logs
- Jest e `ts-jest` para testes unitários
- Docker Compose para o banco local

## Arquitetura

```text
app/api/          Adaptadores HTTP: webhook, agendamentos e cron
models/           Regras de domínio: conversa, agenda, disponibilidade e cliente
infra/            Banco, migrations, logs e cliente da WhatsApp Cloud API
tests/            Testes unitários
```

O webhook apenas interpreta o evento recebido e delega o processamento para `models/conversa.ts`. As regras de disponibilidade e agendamento permanecem fora da camada HTTP, permitindo reutilizá-las pelo bot e por futuras interfaces administrativas.

## Fluxo de conversa

```text
Mensagem do cliente
  -> webhook
  -> conversa persistida no PostgreSQL
  -> menu
       -> agendar -> escolher horário -> confirmar -> criar agendamento
       -> ver agendamentos -> cancelar, quando permitido
       -> falar com atendente
```

O estado e o contexto da conversa são armazenados na tabela `conversas`. Isso evita depender da memória do processo do Next.js entre eventos de webhook.

## Configuração local

```bash
npm install
cp .env.example .env.development
npm run services:up
npm run migration:up
npm run dev
```

Copie `.env.example` para `.env.development` e configure as credenciais do banco e da Meta. O arquivo de produção está no `.gitignore`, mas cuidado para ele não ser versionado.

## Webhook da Meta

O endpoint de webhook é:

```text
GET/POST /api/webhook
```

Para validar a assinatura inicial, a Meta chama o `GET` com `hub.mode`, `hub.verify_token` e `hub.challenge`. O valor de `WHATSAPP_VERIFY_TOKEN` precisa ser igual ao token configurado no painel da Meta.

Para receber chamadas externas durante o desenvolvimento, a porta da aplicação deve ser pública. Em GitHub Codespaces, defina a visibilidade da porta `3000` como **Public** no painel **Ports**. Mantenha a porta do PostgreSQL (`5432`) como **Private**.

Uma resposta de verificação bem-sucedida é `HTTP 200` com o conteúdo de `hub.challenge`. Um `HTTP 302` para login do GitHub indica que a porta ainda está privada.

Contas/números de teste da Meta podem reportar falha de entrega por restrição regional (por exemplo, código `130497`). Esse cenário é externo à lógica do bot; o fluxo ainda pode ser validado com eventos reais ou simulados.

## Comandos

| Comando                 | Descrição                            |
| ----------------------- | ------------------------------------ |
| `npm run dev`           | Inicia banco e aplicação localmente. |
| `npm run migration:up`  | Executa migrations pendentes.        |
| `npm test`              | Executa testes unitários.            |
| `npm run lint:check`    | Verifica lint e formatação.          |
| `npm run services:down` | Para e remove os serviços locais.    |

## Testes

Os testes ficam em `tests/`. Eles usam ambiente Node.js, resolvem o alias `@/` e não devem escrever no banco de desenvolvimento.

## Licença

A definir.
