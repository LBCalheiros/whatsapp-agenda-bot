import { NextResponse } from 'next/server';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { listarAgendamentos } from '@/models/agendamento';
import { listarAtendimentos } from '@/models/atendimento';
import { AppError } from '@/infra/errors';
import { fimDoDiaBRT } from '@/infra/data';

const LIMITE_PROXIMOS_AGENDAMENTOS = 5;

export async function GET() {
  const sessao = await obterSessaoAtual();
  if (!sessao) {
    return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  }

  try {
    const [agendamentosFuturos, atendimentosAguardando] = await Promise.all([
      listarAgendamentos({ apenasFuturos: true }),
      listarAtendimentos({ status: 'aguardando_humano' }),
    ]);

    const agora = new Date();
    const fimDeHoje = fimDoDiaBRT(agora);
    const fimDaSemana = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);

    const agendamentosHoje = agendamentosFuturos.filter(
      (a) => new Date(a.data_hora) <= fimDeHoje,
    ).length;
    const agendamentosSemana = agendamentosFuturos.filter(
      (a) => new Date(a.data_hora) <= fimDaSemana,
    ).length;

    return NextResponse.json({
      resumo: {
        agendamentosHoje,
        agendamentosSemana,
        atendimentosAguardando: atendimentosAguardando.length,
      },
      proximosAgendamentos: agendamentosFuturos.slice(0, LIMITE_PROXIMOS_AGENDAMENTOS),
      atendimentosAguardando,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ erro: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
