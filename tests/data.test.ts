import { criarDataBRT, formatarDataYYYYMMDD } from '@/infra/data';

describe('infra/data', () => {
  it('formata a data usando o calendário de São Paulo, sem depender do UTC do processo', () => {
    const instante = new Date('2026-10-01T00:30:00.000Z');
    expect(formatarDataYYYYMMDD(instante)).toBe('2026-09-30');
  });

  it('mantém a data BRT informada ao criar uma data', () => {
    const instante = criarDataBRT('2026-10-06');
    expect(formatarDataYYYYMMDD(instante)).toBe('2026-10-06');
  });
});
