'use client';

import { useState, FormEvent } from 'react';
import { useApiPolling } from '@/hooks/useApiPolling';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import Link from 'next/link';

type StatusAtendimento = 'bot_ativo' | 'aguardando_humano' | 'humano_ativo' | 'encerrado';

type Atendimento = {
  id: number;
  cliente_id: number;
  cliente_nome: string | null;
  cliente_telefone: string;
  funcionario_email: string | null;
  status: StatusAtendimento;
  criado_em: string;
  agendamento_data_hora: string | null;
  agendamento_servico_nome: string | null;
};

type Mensagem = {
  id: number;
  remetente: 'cliente' | 'funcionario';
  texto: string;
  criado_em: string;
};

const ROTULOS_STATUS: Record<StatusAtendimento, string> = {
  bot_ativo: 'Bot',
  aguardando_humano: 'Aguardando',
  humano_ativo: 'Em atendimento',
  encerrado: 'Encerrado',
};

const INTERVALO_LISTA_MS = 5000;
const INTERVALO_MENSAGENS_MS = 3000;

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AtendimentosPage() {
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeRascunho, setNomeRascunho] = useState('');
  const [salvandoNome, setSalvandoNome] = useState(false);

  const listaEstado = useApiPolling<Atendimento[]>('/api/atendimentos', INTERVALO_LISTA_MS);
  const mensagensEstado = useApiPolling<Mensagem[]>(
    selecionadoId ? `/api/atendimentos/${selecionadoId}/mensagens` : null,
    INTERVALO_MENSAGENS_MS,
  );

  const lista = listaEstado.status === 'sucesso' ? listaEstado.dados : [];
  const selecionado = lista.find((a) => a.id === selecionadoId) ?? null;

  const grupos: { titulo: string; status: StatusAtendimento }[] = [
    { titulo: 'Aguardando', status: 'aguardando_humano' },
    { titulo: 'Em atendimento', status: 'humano_ativo' },
    { titulo: 'Encerradas', status: 'encerrado' },
  ];

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
    } catch (error) {
      setErroAcao(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvandoNome(false);
    }
  }

  async function assumir() {
    if (!selecionadoId) return;
    setErroAcao(null);
    try {
      await apiFetch(`/api/atendimentos/${selecionadoId}/assumir`, { method: 'POST' });
    } catch (error) {
      setErroAcao(error instanceof ApiError ? error.message : 'Erro inesperado');
    }
  }

  async function encerrar() {
    if (!selecionadoId) return;
    setErroAcao(null);
    try {
      await apiFetch(`/api/atendimentos/${selecionadoId}/encerrar`, { method: 'POST' });
    } catch (error) {
      setErroAcao(error instanceof ApiError ? error.message : 'Erro inesperado');
    }
  }

  async function enviarMensagem(evento: FormEvent) {
    evento.preventDefault();
    if (!selecionadoId || !rascunho.trim()) return;

    setErroAcao(null);
    setEnviando(true);
    try {
      await apiFetch(`/api/atendimentos/${selecionadoId}/mensagens`, {
        method: 'POST',
        body: JSON.stringify({ texto: rascunho }),
      });
      setRascunho('');
    } catch (error) {
      setErroAcao(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 md:h-[calc(100vh-3rem)] md:flex-row">
      <div className="w-full shrink-0 overflow-y-auto md:w-80">
        <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Atendimentos
        </h1>

        {listaEstado.status === 'carregando' && <LoadingState texto="Carregando..." />}
        {listaEstado.status === 'erro' && <ErrorState mensagem={listaEstado.mensagem} />}

        {listaEstado.status === 'sucesso' &&
          grupos.map((grupo) => {
            const itens = lista.filter((a) => a.status === grupo.status);
            return (
              <div key={grupo.status} className="mb-5">
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  {grupo.titulo} ({itens.length})
                </h2>
                {itens.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">Nenhum</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {itens.map((atendimento) => (
                      <li key={atendimento.id}>
                        <button
                          onClick={() => {
                            setSelecionadoId(atendimento.id);
                            setEditandoNome(false);
                          }}
                          className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
                            selecionadoId === atendimento.id
                              ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                          }`}
                        >
                          {atendimento.cliente_nome ?? atendimento.cliente_telefone}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
      </div>

      <div className="flex-1">
        {!selecionado && (
          <Card className="flex md:h-full items-center justify-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Selecione uma conversa à esquerda.
            </p>
          </Card>
        )}

        {selecionado && (
          <Card className="flex md:h-full flex-col">
            <div className="flex items-start justify-between border-b border-gray-200 pb-3 dark:border-gray-700">
              <div>
                {editandoNome ? (
                  <form onSubmit={salvarNome} className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={nomeRascunho}
                      onChange={(evento) => setNomeRascunho(evento.target.value)}
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
                  {selecionado.cliente_telefone}
                </p>
                {selecionado.agendamento_data_hora && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Agendamento: {selecionado.agendamento_servico_nome} em{' '}
                    {formatarHora(selecionado.agendamento_data_hora)}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Status: {ROTULOS_STATUS[selecionado.status]}
                  {selecionado.funcionario_email ? ` · ${selecionado.funcionario_email}` : ''}
                </p>
                <Link
                  href={`/painel/agenda?cliente=${encodeURIComponent(selecionado.cliente_telefone)}`}
                  className="mt-1 inline-block text-xs text-gray-500 hover:underline dark:text-gray-400"
                >
                  Ver agendamentos deste cliente →
                </Link>
              </div>

              {selecionado.status === 'aguardando_humano' && (
                <Button onClick={assumir}>Assumir atendimento</Button>
              )}
              {selecionado.status === 'humano_ativo' && (
                <Button variante="secundario" onClick={encerrar}>
                  Encerrar atendimento
                </Button>
              )}
            </div>

            {erroAcao && (
              <div className="mt-3">
                <ErrorState mensagem={erroAcao} />
              </div>
            )}

            <div className="flex-1 overflow-y-auto py-4">
              {mensagensEstado.status === 'carregando' && (
                <LoadingState texto="Carregando mensagens..." />
              )}
              {mensagensEstado.status === 'erro' && (
                <ErrorState mensagem={mensagensEstado.mensagem} />
              )}
              {mensagensEstado.status === 'sucesso' && (
                <ul className="flex flex-col gap-2">
                  {mensagensEstado.dados.map((mensagem) => (
                    <li
                      key={mensagem.id}
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        mensagem.remetente === 'funcionario'
                          ? 'ml-auto bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                      }`}
                    >
                      {mensagem.texto}
                      <div className="mt-1 text-[10px] opacity-60">
                        {formatarHora(mensagem.criado_em)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selecionado.status === 'humano_ativo' && (
              <form
                onSubmit={enviarMensagem}
                className="flex gap-2 border-t border-gray-200 pt-3 dark:border-gray-700"
              >
                <input
                  value={rascunho}
                  onChange={(evento) => setRascunho(evento.target.value)}
                  placeholder="Digite uma mensagem..."
                  className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-gray-400"
                />
                <Button type="submit" disabled={enviando || !rascunho.trim()}>
                  Enviar
                </Button>
              </form>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
