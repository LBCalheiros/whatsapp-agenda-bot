export const FUSO_HORARIO = 'America/Sao_Paulo';

export function formatarDataHora(data: Date): string {
  return data.toLocaleString('pt-BR', {
    timeZone: FUSO_HORARIO,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
