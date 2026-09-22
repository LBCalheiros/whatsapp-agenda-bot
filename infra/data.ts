export const FUSO_HORARIO = 'America/Sao_Paulo';
// Brasil não tem mais horário de verão desde 2019 — offset fixo é seguro
const OFFSET_FUSO_MINUTOS = -3 * 60;

export function paraHorarioLocal(instante: Date): Date {
  return new Date(instante.getTime() + OFFSET_FUSO_MINUTOS * 60_000);
}

export function paraInstanteReal(horarioLocal: Date): Date {
  return new Date(horarioLocal.getTime() - OFFSET_FUSO_MINUTOS * 60_000);
}

export function inicioDoDiaBRT(data: Date): Date {
  const local = paraHorarioLocal(data);
  local.setUTCHours(0, 0, 0, 0);
  return paraInstanteReal(local);
}

export function fimDoDiaBRT(data: Date): Date {
  const local = paraHorarioLocal(data);
  local.setUTCHours(23, 59, 59, 999);
  return paraInstanteReal(local);
}

export function formatarDataHora(data: Date): string {
  return data.toLocaleString('pt-BR', {
    timeZone: FUSO_HORARIO,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
