'use client';

import { useState, FormEvent } from 'react';
import { useApiPolling } from '@/hooks/useApiPolling';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

type Regra = {
  id: number;
  dia_semana: number;
  horario_inicio: string;
  horario_fim: string;
  intervalo_minutos: number;
};

type Bloqueio = {
  id: number;
  inicio: string;
  fim: string;
  motivo: string | null;
};

const NOMES_DIAS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

const INTERVALO_POLLING_MS = 60000;

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function paraInputDatetimeLocal(data: Date): string {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(data);
  return partes.replace(' ', 'T');
}

function LinhaDia({
  diaSemana,
  regra,
  onSalvar,
  onRemover,
}: {
  diaSemana: number;
  regra: Regra | undefined;
  onSalvar: (dados: {
    diaSemana: number;
    horarioInicio: string;
    horarioFim: string;
    intervaloMinutos: number;
  }) => Promise<void>;
  onRemover: (diaSemana: number) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [horarioInicio, setHorarioInicio] = useState(regra?.horario_inicio.slice(0, 5) ?? '09:00');
  const [horarioFim, setHorarioFim] = useState(regra?.horario_fim.slice(0, 5) ?? '18:00');
  const [intervaloMinutos, setIntervaloMinutos] = useState(regra?.intervalo_minutos ?? 30);
  const [salvando, setSalvando] = useState(false);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setSalvando(true);
    try {
      await onSalvar({ diaSemana, horarioInicio, horarioFim, intervaloMinutos });
      setEditando(false);
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    if (!confirm(`Fechar ${NOMES_DIAS[diaSemana]}? Nenhum horário será oferecido nesse dia.`)) {
      return;
    }
    setSalvando(true);
    try {
      await onRemover(diaSemana);
    } finally {
      setSalvando(false);
    }
  }

  if (editando) {
    return (
      <form
        onSubmit={salvar}
        className="flex flex-wrap items-center gap-2 border-b border-gray-100 py-2 last:border-0 dark:border-gray-800"
      >
        <span className="w-32 text-sm text-gray-900 dark:text-gray-100">
          {NOMES_DIAS[diaSemana]}
        </span>
        <input
          type="time"
          value={horarioInicio}
          onChange={(e) => setHorarioInicio(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <span className="text-sm text-gray-400">até</span>
        <input
          type="time"
          value={horarioFim}
          onChange={(e) => setHorarioFim(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          type="number"
          min={5}
          step={5}
          value={intervaloMinutos}
          onChange={(e) => setIntervaloMinutos(Number(e.target.value))}
          className="w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <span className="text-sm text-gray-400">min/consulta</span>
        <Button type="submit" disabled={salvando}>
          Salvar
        </Button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="text-xs text-gray-500 hover:underline dark:text-gray-400"
        >
          Cancelar
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-2 last:border-0 dark:border-gray-800">
      <span className="w-32 text-sm text-gray-900 dark:text-gray-100">
        {NOMES_DIAS[diaSemana]}
      </span>
      {regra ? (
        <span className="flex-1 text-sm text-gray-600 dark:text-gray-400">
          {regra.horario_inicio.slice(0, 5)} às {regra.horario_fim.slice(0, 5)} ·{' '}
          {regra.intervalo_minutos}min por consulta
        </span>
      ) : (
        <span className="flex-1 text-sm text-gray-400 dark:text-gray-500">Fechado</span>
      )}
      <div className="flex gap-3">
        <button
          onClick={() => setEditando(true)}
          className="text-xs text-gray-500 hover:underline dark:text-gray-400"
        >
          {regra ? 'editar' : 'abrir'}
        </button>
        {regra && (
          <button
            onClick={remover}
            disabled={salvando}
            className="text-xs text-gray-500 hover:underline disabled:opacity-50 dark:text-gray-400"
          >
            fechar
          </button>
        )}
      </div>
    </div>
  );
}

export default function DisponibilidadePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [erroBloqueio, setErroBloqueio] = useState<string | null>(null);
  const [salvandoBloqueio, setSalvandoBloqueio] = useState(false);

  const agora = new Date();
  const daquiUmaHora = new Date(agora.getTime() + 60 * 60 * 1000);
  const [inicioBloqueio, setInicioBloqueio] = useState(paraInputDatetimeLocal(agora));
  const [fimBloqueio, setFimBloqueio] = useState(paraInputDatetimeLocal(daquiUmaHora));
  const [motivoBloqueio, setMotivoBloqueio] = useState('');

  const regrasEstado = useApiPolling<Regra[]>(
    `/api/disponibilidade/regras?_r=${refreshKey}`,
    INTERVALO_POLLING_MS,
  );
  const bloqueiosEstado = useApiPolling<Bloqueio[]>(
    `/api/disponibilidade/bloqueios?_r=${refreshKey}`,
    INTERVALO_POLLING_MS,
  );

  function forcarAtualizacao() {
    setRefreshKey((k) => k + 1);
  }

  async function salvarRegra(dados: {
    diaSemana: number;
    horarioInicio: string;
    horarioFim: string;
    intervaloMinutos: number;
  }) {
    await apiFetch('/api/disponibilidade/regras', {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
    forcarAtualizacao();
  }

  async function removerRegra(diaSemana: number) {
    await apiFetch(`/api/disponibilidade/regras/${diaSemana}`, { method: 'DELETE' });
    forcarAtualizacao();
  }

  async function criarBloqueio(evento: FormEvent) {
    evento.preventDefault();
    setErroBloqueio(null);
    setSalvandoBloqueio(true);
    try {
      // datetime-local não carrega timezone; assume-se sempre horário de Brasília (-03:00)
      await apiFetch('/api/disponibilidade/bloqueios', {
        method: 'POST',
        body: JSON.stringify({
          inicio: `${inicioBloqueio}:00-03:00`,
          fim: `${fimBloqueio}:00-03:00`,
          motivo: motivoBloqueio.trim() || undefined,
        }),
      });
      setMotivoBloqueio('');
      forcarAtualizacao();
    } catch (error) {
      setErroBloqueio(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvandoBloqueio(false);
    }
  }

  async function removerBloqueio(id: number) {
    if (!confirm('Remover este bloqueio?')) return;
    await apiFetch(`/api/disponibilidade/bloqueios/${id}`, { method: 'DELETE' });
    forcarAtualizacao();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Disponibilidade</h1>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Dias de atendimento
        </h2>

        {regrasEstado.status === 'carregando' && <LoadingState texto="Carregando..." />}
        {regrasEstado.status === 'erro' && <ErrorState mensagem={regrasEstado.mensagem} />}

        {regrasEstado.status === 'sucesso' && (
          <div>
            {Array.from({ length: 7 }, (_, diaSemana) => (
              <LinhaDia
                key={diaSemana}
                diaSemana={diaSemana}
                regra={regrasEstado.dados.find((r) => r.dia_semana === diaSemana)}
                onSalvar={salvarRegra}
                onRemover={removerRegra}
              />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Bloqueios</h2>

        {erroBloqueio && <ErrorState mensagem={erroBloqueio} />}

        <form onSubmit={criarBloqueio} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400">Início</label>
            <input
              type="datetime-local"
              value={inicioBloqueio}
              onChange={(e) => setInicioBloqueio(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400">Fim</label>
            <input
              type="datetime-local"
              value={fimBloqueio}
              onChange={(e) => setFimBloqueio(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400">Motivo (opcional)</label>
            <input
              type="text"
              value={motivoBloqueio}
              onChange={(e) => setMotivoBloqueio(e.target.value)}
              placeholder="Ex: férias"
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <Button type="submit" disabled={salvandoBloqueio}>
            Adicionar bloqueio
          </Button>
        </form>

        {bloqueiosEstado.status === 'carregando' && <LoadingState texto="Carregando..." />}
        {bloqueiosEstado.status === 'erro' && <ErrorState mensagem={bloqueiosEstado.mensagem} />}

        {bloqueiosEstado.status === 'sucesso' && (
          <ul className="flex flex-col gap-1">
            {bloqueiosEstado.dados.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Nenhum bloqueio futuro cadastrado.
              </p>
            )}
            {bloqueiosEstado.dados.map((bloqueio) => (
              <li
                key={bloqueio.id}
                className="flex items-center justify-between border-b border-gray-100 py-2 text-sm last:border-0 dark:border-gray-800"
              >
                <span className="text-gray-700 dark:text-gray-300">
                  {formatarDataHora(bloqueio.inicio)} até {formatarDataHora(bloqueio.fim)}
                  {bloqueio.motivo ? ` · ${bloqueio.motivo}` : ''}
                </span>
                <button
                  onClick={() => removerBloqueio(bloqueio.id)}
                  className="text-xs text-gray-500 hover:underline dark:text-gray-400"
                >
                  remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
