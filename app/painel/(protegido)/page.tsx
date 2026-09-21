'use client';

import { useApi } from '@/hooks/useApi';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';

type Agendamento = {
  id: number;
  data_hora: string;
  cliente_nome: string | null;
  servico_nome: string;
};

type AtendimentoAguardando = {
  id: number;
  cliente_nome: string | null;
  cliente_telefone: string;
  criado_em: string;
};

type DashboardData = {
  resumo: {
    agendamentosHoje: number;
    agendamentosSemana: number;
    atendimentosAguardando: number;
  };
  proximosAgendamentos: Agendamento[];
  atendimentosAguardando: AtendimentoAguardando[];
};

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PainelDashboardPage() {
  const estado = useApi<DashboardData>('/api/dashboard');

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>

      {estado.status === 'carregando' && <LoadingState texto="Carregando dashboard..." />}
      {estado.status === 'erro' && <ErrorState mensagem={estado.mensagem} />}

      {estado.status === 'sucesso' && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-sm text-gray-500 dark:text-gray-400">Agendamentos hoje</p>
              <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-gray-100">
                {estado.dados.resumo.agendamentosHoje}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500 dark:text-gray-400">Agendamentos essa semana</p>
              <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-gray-100">
                {estado.dados.resumo.agendamentosSemana}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500 dark:text-gray-400">Atendimentos aguardando</p>
              <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-gray-100">
                {estado.dados.resumo.atendimentosAguardando}
              </p>
            </Card>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Próximos agendamentos
              </h2>
              {estado.dados.proximosAgendamentos.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  Nenhum agendamento futuro.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {estado.dados.proximosAgendamentos.map((agendamento) => (
                    <li key={agendamento.id} className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">
                        {agendamento.cliente_nome ?? 'Cliente sem nome'} ·{' '}
                        {agendamento.servico_nome}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {formatarDataHora(agendamento.data_hora)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Atendimentos aguardando
              </h2>
              {estado.dados.atendimentosAguardando.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  Nenhum atendimento pendente.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {estado.dados.atendimentosAguardando.map((atendimento) => (
                    <li key={atendimento.id} className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">
                        {atendimento.cliente_nome ?? atendimento.cliente_telefone}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {formatarDataHora(atendimento.criado_em)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
