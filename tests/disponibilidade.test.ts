import { criarRegraDisponibilidade } from '@/models/disponibilidade';
import { AppError } from '@/infra/errors';

describe('criarRegraDisponibilidade', () => {
  it('rejeita dia da semana inválido', async () => {
    await expect(
      criarRegraDisponibilidade({
        profissionalId: 1,
        diaSemana: 7,
        horarioInicio: '09:00',
        horarioFim: '18:00',
        intervaloMinutos: 30,
      }),
    ).rejects.toThrow(AppError);
  });

  it('rejeita horário inicial depois do horário final', async () => {
    await expect(
      criarRegraDisponibilidade({
        profissionalId: 1,
        diaSemana: 1,
        horarioInicio: '18:00',
        horarioFim: '09:00',
        intervaloMinutos: 30,
      }),
    ).rejects.toThrow(AppError);
  });

  it('rejeita intervalo zero ou negativo', async () => {
    await expect(
      criarRegraDisponibilidade({
        profissionalId: 1,
        diaSemana: 1,
        horarioInicio: '09:00',
        horarioFim: '18:00',
        intervaloMinutos: 0,
      }),
    ).rejects.toThrow(AppError);
  });
});
