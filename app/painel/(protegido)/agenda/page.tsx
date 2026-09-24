'use client';

import { useMemo, useState, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApiPolling } from '@/hooks/useApiPolling';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

type StatusAgendamento = 'agendado' | 'confirmado' | 'cancelado' | 'completo' | 'nao_compareceu';

type Aba = 'proximos' | 'historico';
type Periodo = 'todos' | 'hoje' | 'semana' | 'mes';

type Agendamento = {
  id: number;
  cliente_id: number;
  cliente_nome: string | null;
  cliente_telefone: string;
  profissional_nome: string;
  servico_nome: string;
  duracao_minutos: number;
  data_hora: string;
  status: StatusAgendamento;
  observacoes: string | null;
};

type Servico = {
  id: number;
  nome: string;
};

const ROTULOS_STATUS: Record<StatusAgendamento, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  completo: 'Completo',
  nao_compareceu: 'Não compareceu',
};

const INTERVALO_LISTA_MS = 15000;

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function paraInputDatetimeLocal(iso: string): string {
  // datetime-local não entende timezone; formata em BRT manualmente
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
  return partes.replace(' ', 'T');
}

function paraDataYYYYMMDD(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function linkWhatsapp(telefone: string): string {
  return `https://wa.me/${telefone.replace(/\D/g, '')}`;
}

export default function AgendaPage() {
  const searchParams = useSearchParams();

  const [aba, setAba] = useState<Aba>('proximos');
  const [periodo, setPeriodo] = useState<Periodo>('todos');
  const [filtroServicoId, setFiltroServicoId] = useState('');
  const [filtroCliente, setFiltroCliente] = useState(searchParams.get('cliente') ?? '');
  const [filtroStatusHistorico, setFiltroStatusHistorico] = useState<'' | 'cancelado' | 'completo'>(
    '',
  );

  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeRascunho, setNomeRascunho] = useState('');
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [observacoesRascunho, setObservacoesRascunho] = useState('');
  const [novaDataHora, setNovaDataHora] = useState('');
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const servicosEstado = useApiPolling<Servico[]>('/api/servicos', 60000);
  const servicos = servicosEstado.status === 'sucesso' ? servicosEstado.dados : [];

  // "hoje" cobre só o dia de hoje; "semana"/"mes" vão de hoje até +7/+30 dias.
  // Só se aplica na aba "Próximos" — "Histórico" tem período fixo de 30 dias.
  const { dataInicio, dataFim } = useMemo(() => {
    if (aba === 'historico' || periodo === 'todos') return { dataInicio: '', dataFim: '' };
    const hoje = new Date();
    const dias = periodo === 'hoje' ? 0 : periodo === 'semana' ? 7 : 30;
    const fim = new Date(hoje.getTime() + dias * 24 * 60 * 60 * 1000);
    return { dataInicio: paraDataYYYYMMDD(hoje), dataFim: paraDataYYYYMMDD(fim) };
  }, [aba, periodo]);

  const caminhoLista = useMemo(() => {
    const params = new URLSearchParams();
    if (aba === 'proximos') {
      params.set('apenasFuturos', 'true');
    } else {
      params.set('historico', 'true');
      if (filtroStatusHistorico) params.set('status', filtroStatusHistorico);
    }
    if (dataInicio && dataFim) {
      params.set('dataInicio', dataInicio);
      params.set('dataFim', dataFim);
    }
    if (filtroServicoId) params.set('servicoId', filtroServicoId);
    if (filtroCliente.trim()) params.set('buscaCliente', filtroCliente.trim());
    params.set('_r', String(refreshKey));
    return `/api/agendamentos?${params.toString()}`;
  }, [aba, dataInicio, dataFim, filtroServicoId, filtroCliente, refreshKey]);

  const listaEstado = useApiPolling<Agendamento[]>(caminhoLista, INTERVALO_LISTA_MS);
  const lista = listaEstado.status === 'sucesso' ? listaEstado.dados : [];
  const selecionado = lista.find((a) => a.id === selecionadoId) ?? null;

  function forcarAtualizacao() {
    setRefreshKey((k) => k + 1);
  }

  function trocarAba(novaAba: Aba) {
    setAba(novaAba);
    setFiltroStatusHistorico('');
    setSelecionadoId(null);
    setEditandoNome(false);
    setErroAcao(null);
  }

  function selecionar(agendamento: Agendamento) {
    setSelecionadoId(agendamento.id);
    setEditandoNome(false);
    setObservacoesRascunho(agendamento.observacoes ?? '');
    setNovaDataHora(paraInputDatetimeLocal(agendamento.data_hora));
    setErroAcao(null);
  }

  function iniciarEdicaoNome() {
    if (!selecionado) return;
    setNomeRascunho(selecionado.cliente_nome ?? '');
    setEditandoNome(true);
  }

  async function salvarNome(evento: FormEvent) {
    evento.preventDefault();
    if (!selecionado || !nomeRascunho.trim()) return;

    setErroAcao(null);
    setSalvandoNome(true);
    try {
      await apiFetch(`/api/clientes/${selecionado.cliente_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nome: nomeRascunho.trim() }),
      });
      setEditandoNome(false);
      forcarAtualizacao();
    } catch (error) {
      setErroAcao(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvandoNome(false);
    }
  }

  async function salvarObservacoes(evento: FormEvent) {
    evento.preventDefault();
    if (!selecionado) return;

    setErroAcao(null);
    setSalvando(true);
    try {
      await apiFetch(`/api/agendamentos/${selecionado.id}/observacoes`, {
        method: 'PATCH',
        body: JSON.stringify({ observacoes: observacoesRascunho.trim() || null }),
      });
      forcarAtualizacao();
    } catch (error) {
      setErroAcao(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvando(false);
    }
  }

  async function reagendar(evento: FormEvent) {
    evento.preventDefault();
    if (!selecionado || !novaDataHora) return;

    setErroAcao(null);
    setSalvando(true);
    try {
      // datetime-local não carrega timezone; assume-se sempre horário de Brasília (-03:00)
      await apiFetch(`/api/agendamentos/${selecionado.id}/reagendar`, {
        method: 'PATCH',
        body: JSON.stringify({ novaDataHora: `${novaDataHora}:00-03:00` }),
      });
      forcarAtualizacao();
    } catch (error) {
      setErroAcao(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvando(false);
    }
  }

  async function cancelar() {
    if (!selecionado) return;
    if (!confirm('Cancelar este agendamento?')) return;

    setErroAcao(null);
    setSalvando(true);
    try {
      await apiFetch(`/api/agendamentos/${selecionado.id}/cancelar`, { method: 'PATCH' });
      forcarAtualizacao();
    } catch (error) {
      setErroAcao(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] gap-6">
      <div className="w-80 shrink-0 overflow-y-auto">
        <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Agenda</h1>

        <div className="mb-4 flex gap-1 rounded-md bg-gray-100 p-1 dark:bg-gray-800">
          <button
            onClick={() => trocarAba('proximos')}
            className={`flex-1 rounded px-2 py-1.5 text-sm font-medium transition-colors ${
              aba === 'proximos'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Próximos
          </button>
          <button
            onClick={() => trocarAba('historico')}
            className={`flex-1 rounded px-2 py-1.5 text-sm font-medium transition-colors ${
              aba === 'historico'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Histórico
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-2">
          {aba === 'proximos' && (
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value as Periodo)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="todos">Todos os períodos</option>
              <option value="hoje">Hoje</option>
              <option value="semana">Próximos 7 dias</option>
              <option value="mes">Próximo mês</option>
            </select>
          )}
          {aba === 'historico' && (
            <select
              value={filtroStatusHistorico}
              onChange={(e) =>
                setFiltroStatusHistorico(e.target.value as typeof filtroStatusHistorico)
              }
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Cancelados e concluídos</option>
              <option value="cancelado">Só cancelados</option>
              <option value="completo">Só concluídos</option>
            </select>
          )}
          <select
            value={filtroServicoId}
            onChange={(e) => setFiltroServicoId(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">Todos os serviços</option>
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        {listaEstado.status === 'carregando' && <LoadingState texto="Carregando..." />}
        {listaEstado.status === 'erro' && <ErrorState mensagem={listaEstado.mensagem} />}

        {listaEstado.status === 'sucesso' && (
          <ul className="flex flex-col gap-1">
            {lista.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Nenhum agendamento encontrado.
              </p>
            )}
            {lista.map((agendamento) => (
              <li key={agendamento.id}>
                <button
                  onClick={() => selecionar(agendamento)}
                  className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
                    selecionadoId === agendamento.id
                      ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="font-medium">
                    {agendamento.cliente_nome ?? agendamento.cliente_telefone}
                  </div>
                  <div className="text-xs opacity-75">
                    {formatarDataHora(agendamento.data_hora)} · {agendamento.servico_nome}
                    {aba === 'historico' ? ` · ${ROTULOS_STATUS[agendamento.status]}` : ''}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-1">
        {!selecionado && (
          <Card className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Selecione um agendamento à esquerda.
            </p>
          </Card>
        )}

        {selecionado && (
          <Card className="flex h-full flex-col gap-4 overflow-y-auto">
            <div className="border-b border-gray-200 pb-3 dark:border-gray-700">
              {editandoNome ? (
                <form onSubmit={salvarNome} className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nomeRascunho}
                    onChange={(e) => setNomeRascunho(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <button
                    type="submit"
                    disabled={salvandoNome || !nomeRascunho.trim()}
                    className="text-xs font-medium text-gray-900 hover:underline disabled:opacity-50 dark:text-gray-100"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoNome(false)}
                    className="text-xs text-gray-500 hover:underline dark:text-gray-400"
                  >
                    Cancelar
                  </button>
                </form>
              ) : (
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {selecionado.cliente_nome ?? 'Cliente sem nome'}{' '}
                  <button
                    onClick={iniciarEdicaoNome}
                    className="text-xs font-normal text-gray-400 hover:underline dark:text-gray-500"
                  >
                    editar
                  </button>
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <a
                  href={linkWhatsapp(selecionado.cliente_telefone)}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {selecionado.cliente_telefone}
                </a>
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {selecionado.servico_nome} ({selecionado.duracao_minutos}min) com{' '}
                {selecionado.profissional_nome}
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Status: {ROTULOS_STATUS[selecionado.status]}
              </p>
            </div>

            {erroAcao && <ErrorState mensagem={erroAcao} />}

            {aba === 'proximos' && (
              <>
                <div>
                  <h2 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                    Reagendar
                  </h2>
                  <form onSubmit={reagendar} className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      value={novaDataHora}
                      onChange={(e) => setNovaDataHora(e.target.value)}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    />
                    <Button type="submit" disabled={salvando || !novaDataHora}>
                      Confirmar
                    </Button>
                  </form>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Sem checagem de disponibilidade — qualquer horário é aceito.
                  </p>
                </div>

                <div>
                  <h2 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                    Observações
                  </h2>
                  <form onSubmit={salvarObservacoes} className="flex flex-col gap-2">
                    <textarea
                      value={observacoesRascunho}
                      onChange={(e) => setObservacoesRascunho(e.target.value)}
                      rows={4}
                      placeholder="Nenhuma observação..."
                      className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    />
                    <Button type="submit" disabled={salvando} className="self-start">
                      Salvar observações
                    </Button>
                  </form>
                </div>

                {selecionado.status !== 'cancelado' && (
                  <div className="mt-auto border-t border-gray-200 pt-3 dark:border-gray-700">
                    <Button variante="secundario" onClick={cancelar} disabled={salvando}>
                      Cancelar agendamento
                    </Button>
                  </div>
                )}
              </>
            )}

            {aba === 'historico' && (
              <div>
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Observações
                </h2>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {selecionado.observacoes || 'Nenhuma observação registrada.'}
                </p>
                <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                  Agendamentos do histórico não podem ser reagendados ou ter observações editadas —
                  use a aba "Próximos" pra agendamentos futuros.
                </p>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
