'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useApiPolling } from '@/hooks/useApiPolling';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { normalizarTelefone } from '@/infra/telefone';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';

type Servico = { id: number; nome: string };

type ProfissionalComServicos = { id: number; nome: string; servicoIds: number[] };

export type AgendamentoCriado = {
  id: number;
  data_hora: string;
  observacoes: string | null;
};

const CLASSE_CAMPO =
  'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

const CLASSE_ROTULO =
  'mb-1 block text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400';

export function FormNovoAgendamento({
  servicos,
  onCriado,
  onCancelar,
}: {
  servicos: Servico[];
  onCriado: (agendamento: AgendamentoCriado) => void;
  onCancelar: () => void;
}) {
  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [servicoId, setServicoId] = useState('');
  const [profissionalEscolhido, setProfissionalEscolhido] = useState('');
  const [dataHora, setDataHora] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const profissionaisEstado = useApiPolling<ProfissionalComServicos[]>(
    '/api/profissionais?comServicos=true',
    60000,
  );

  const profissionaisDoServico = useMemo(() => {
    if (!servicoId || profissionaisEstado.status !== 'sucesso') return [];
    return profissionaisEstado.dados.filter((p) => p.servicoIds.includes(Number(servicoId)));
  }, [servicoId, profissionaisEstado]);

  // com um único profissional possível não faz sentido obrigar a escolha
  const profissionalId = profissionaisDoServico.some((p) => String(p.id) === profissionalEscolhido)
    ? profissionalEscolhido
    : profissionaisDoServico.length === 1
      ? String(profissionaisDoServico[0].id)
      : '';

  const telefoneNormalizado = telefone.trim() ? normalizarTelefone(telefone) : null;
  const telefoneInvalido = telefone.trim() !== '' && telefoneNormalizado === null;

  const podeSalvar =
    telefoneNormalizado !== null && servicoId !== '' && profissionalId !== '' && dataHora !== '';

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!podeSalvar) return;

    setErro(null);
    setSalvando(true);
    try {
      const criado = await apiFetch<AgendamentoCriado>('/api/agendamentos/manual', {
        method: 'POST',
        body: JSON.stringify({
          telefone,
          nomeCliente: nome.trim() || null,
          servicoId: Number(servicoId),
          profissionalId: Number(profissionalId),
          dataHora: `${dataHora}:00-03:00`,
          observacoes: observacoes.trim() || null,
        }),
      });
      onCriado(criado);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 overflow-y-auto md:h-full">
      <h2 className="border-b border-gray-200 pb-3 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
        Novo agendamento
      </h2>

      {profissionaisEstado.status === 'carregando' && <LoadingState texto="Carregando..." />}
      {profissionaisEstado.status === 'erro' && (
        <ErrorState mensagem={profissionaisEstado.mensagem} />
      )}

      <form onSubmit={salvar} className="flex max-w-md flex-col gap-4">
        <div>
          <label htmlFor="novo-telefone" className={CLASSE_ROTULO}>
            Telefone do cliente
          </label>
          <input
            id="novo-telefone"
            type="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(11) 99999-9999"
            className={`${CLASSE_CAMPO} w-full`}
          />
          {telefoneNormalizado && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Será salvo como {telefoneNormalizado}, o mesmo formato dos clientes do WhatsApp.
            </p>
          )}
          {telefoneInvalido && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Telefone inválido. Use DDD + número.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="novo-nome" className={CLASSE_ROTULO}>
            Nome (opcional)
          </label>
          <input
            id="novo-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={100}
            className={`${CLASSE_CAMPO} w-full`}
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Se o cliente já tiver nome cadastrado, ele é mantido.
          </p>
        </div>

        <div>
          <label htmlFor="novo-servico" className={CLASSE_ROTULO}>
            Serviço
          </label>
          <select
            id="novo-servico"
            value={servicoId}
            onChange={(e) => setServicoId(e.target.value)}
            className={`${CLASSE_CAMPO} w-full`}
          >
            <option value="">Selecione...</option>
            {servicos.map((servico) => (
              <option key={servico.id} value={servico.id}>
                {servico.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="novo-profissional" className={CLASSE_ROTULO}>
            Profissional
          </label>
          <select
            id="novo-profissional"
            value={profissionalId}
            onChange={(e) => setProfissionalEscolhido(e.target.value)}
            disabled={!servicoId}
            className={`${CLASSE_CAMPO} w-full disabled:opacity-50`}
          >
            <option value="">{servicoId ? 'Selecione...' : 'Escolha o serviço primeiro'}</option>
            {profissionaisDoServico.map((profissional) => (
              <option key={profissional.id} value={profissional.id}>
                {profissional.nome}
              </option>
            ))}
          </select>
          {servicoId &&
            profissionaisEstado.status === 'sucesso' &&
            profissionaisDoServico.length === 0 && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Nenhum profissional ativo atende esse serviço.
              </p>
            )}
        </div>

        <div>
          <label htmlFor="novo-data-hora" className={CLASSE_ROTULO}>
            Data e hora
          </label>
          <input
            id="novo-data-hora"
            type="datetime-local"
            value={dataHora}
            onChange={(e) => setDataHora(e.target.value)}
            className={CLASSE_CAMPO}
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Expediente, bloqueios e antecedência mínima não são conferidos, quem decide é você. Só
            não pode sobrepor outro agendamento do mesmo profissional.
          </p>
        </div>

        <div>
          <label htmlFor="novo-observacoes" className={CLASSE_ROTULO}>
            Observações (opcional)
          </label>
          <textarea
            id="novo-observacoes"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            maxLength={1000}
            className={`${CLASSE_CAMPO} w-full`}
          />
        </div>

        {erro && <ErrorState mensagem={erro} />}

        <div className="flex gap-2">
          <Button type="submit" disabled={salvando || !podeSalvar}>
            Criar agendamento
          </Button>
          <Button type="button" variante="secundario" onClick={onCancelar} disabled={salvando}>
            Cancelar
          </Button>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500">
          O cliente não recebe mensagem agora. Se o agendamento for para amanhã, ele recebe o
          lembrete de 24h como os demais.
        </p>
      </form>
    </Card>
  );
}
