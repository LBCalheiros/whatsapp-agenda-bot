import { pool } from '@/infra/database';
import { comLockDeConversa } from '@/infra/lockConversa';

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('infra/lockConversa', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('serializa duas execuções concorrentes pro mesmo telefone', async () => {
    const telefone = '5511900000010';
    const eventos: string[] = [];

    async function tarefa(nome: string, duracaoMs: number) {
      return comLockDeConversa(telefone, async () => {
        eventos.push(`${nome}:inicio`);
        await esperar(duracaoMs);
        eventos.push(`${nome}:fim`);
      });
    }

    await Promise.all([tarefa('A', 50), tarefa('B', 10)]);

    // se estivesse rodando em paralelo, "B:inicio" apareceria antes de "A:fim"
    // (B é mais rápida); com o lock, uma tarefa só começa depois que a outra terminou
    const indiceFimA = eventos.indexOf('A:fim');
    const indiceInicioB = eventos.indexOf('B:inicio');
    const indiceFimB = eventos.indexOf('B:fim');
    const indiceInicioA = eventos.indexOf('A:inicio');

    const primeiraTerminouAntesDaSegundaComecar =
      indiceFimA < indiceInicioB || indiceFimB < indiceInicioA;

    expect(primeiraTerminouAntesDaSegundaComecar).toBe(true);
  });

  it('não bloqueia telefones diferentes entre si', async () => {
    const inicio = Date.now();

    await Promise.all([
      comLockDeConversa('5511900000011', () => esperar(50)),
      comLockDeConversa('5511900000012', () => esperar(50)),
    ]);

    const duracaoTotal = Date.now() - inicio;
    // se estivesse serializando por engano, levaria ~100ms; em paralelo, ~50ms
    expect(duracaoTotal).toBeLessThan(90);
  });

  it('libera o lock mesmo quando a função lançada dentro dele falha', async () => {
    const telefone = '5511900000013';

    await expect(
      comLockDeConversa(telefone, async () => {
        throw new Error('falha proposital');
      }),
    ).rejects.toThrow('falha proposital');

    // se o lock tivesse vazado, essa segunda chamada ficaria travada pra sempre;
    // o teste falha por timeout do Jest se isso acontecer
    let executou = false;
    await comLockDeConversa(telefone, async () => {
      executou = true;
    });

    expect(executou).toBe(true);
  });
});
