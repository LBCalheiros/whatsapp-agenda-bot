// Espera o Postgres do Docker Compose aceitar conexões antes de rodar migrations, o app ou
// os testes. `services:up` devolve o controle assim que o container sobe, o que não quer
// dizer que o banco já esteja pronto.
const { exec } = require('node:child_process');

const INTERVALO_MS = 1000;
const TIMEOUT_MS = 60_000;
const COMANDO = 'docker compose -f infra/compose.yaml exec -T postgres pg_isready -U postgres';

const inicio = Date.now();

function verificar() {
  exec(COMANDO, (error, stdout, stderr) => {
    if (stdout.includes('accepting connections')) {
      console.log('\n🟢 Postgres está pronto e aceitando conexões!\n');
      return;
    }

    // 127 = comando não encontrado; esperar mais não vai resolver
    if (error && error.code === 127) {
      console.error('\n🔴 Não foi possível executar o Docker. Ele está instalado e no PATH?\n');
      process.exit(1);
    }

    if (Date.now() - inicio > TIMEOUT_MS) {
      console.error(
        `\n🔴 Postgres não ficou pronto em ${TIMEOUT_MS / 1000}s.\n${stderr || stdout}\n`,
      );
      process.exit(1);
    }

    process.stdout.write('.');
    setTimeout(verificar, INTERVALO_MS);
  });
}

process.stdout.write('\n🔴 Aguardando Postgres aceitar conexões');
verificar();
