'use client';

import { useState, FormEvent } from 'react';
import { useApiPolling } from '@/hooks/useApiPolling';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

type Servico = {
  id: number;
  nome: string;
  duracao_minutos: number;
  preco: string | null;
  ativo: boolean;
};

type EuMesmo = {
  id: number;
  email: string;
  role: 'gerente' | 'funcionario';
};

function formatarPreco(preco: string | null): string {
  if (preco === null) return '—';
  return Number(preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function FormularioServico({ servico, onSalvo }: { servico: Servico; onSalvo: () => void }) {
  const [nome, setNome] = useState(servico.nome);
  const [duracaoMinutos, setDuracaoMinutos] = useState(servico.duracao_minutos);
  const [preco, setPreco] = useState(servico.preco ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await apiFetch(`/api/servicos/${servico.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nome,
          duracaoMinutos,
          preco: preco === '' ? null : Number(preco),
        }),
      });
      onSalvo();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo() {
    const acao = servico.ativo ? 'desativar' : 'reativar';
    if (!confirm(`Tem certeza que quer ${acao} "${servico.nome}"?`)) return;

    setErro(null);
    setSalvando(true);
    try {
      await apiFetch(`/api/servicos/${servico.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ativo: !servico.ativo }),
      });
      onSalvo();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          Nome
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          Duração (minutos)
          <input
            type="number"
            min={5}
            step={5}
            value={duracaoMinutos}
            onChange={(e) => setDuracaoMinutos(Number(e.target.value))}
            required
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          Preço (opcional)
          <input
            type="number"
            min={0}
            step={0.01}
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            placeholder="Sem preço definido"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        {!servico.ativo && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Este serviço está desativado — não aparece como opção pra novos agendamentos, mas
            agendamentos já existentes com ele continuam normais.
          </p>
        )}

        {erro && <ErrorState mensagem={erro} />}

        <div className="mt-2 flex items-center justify-between">
          <Button type="submit" disabled={salvando}>
            Salvar
          </Button>
          <button
            type="button"
            onClick={alternarAtivo}
            disabled={salvando}
            className="text-xs text-gray-500 hover:underline disabled:opacity-50 dark:text-gray-400"
          >
            {servico.ativo ? 'Desativar' : 'Reativar'}
          </button>
        </div>
      </form>
    </Card>
  );
}

function FormularioNovoServico({ onCriado }: { onCriado: () => void }) {
  const [nome, setNome] = useState('');
  const [duracaoMinutos, setDuracaoMinutos] = useState(30);
  const [preco, setPreco] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await apiFetch('/api/servicos', {
        method: 'POST',
        body: JSON.stringify({
          nome,
          duracaoMinutos,
          preco: preco === '' ? null : Number(preco),
        }),
      });
      setNome('');
      setDuracaoMinutos(30);
      setPreco('');
      onCriado();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Novo serviço</h2>
      <form onSubmit={criar} className="flex flex-col gap-3">
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do serviço"
          required
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          type="number"
          min={5}
          step={5}
          value={duracaoMinutos}
          onChange={(e) => setDuracaoMinutos(Number(e.target.value))}
          placeholder="Duração (minutos)"
          required
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          type="number"
          min={0}
          step={0.01}
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          placeholder="Preço (opcional)"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />

        {erro && <ErrorState mensagem={erro} />}

        <Button type="submit" disabled={salvando} className="self-start">
          Criar serviço
        </Button>
      </form>
    </Card>
  );
}

export default function ServicosPage() {
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [mostrarFormNovo, setMostrarFormNovo] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const euEstado = useApiPolling<EuMesmo>('/api/auth/me', 60000);
  const listaEstado = useApiPolling<Servico[]>(
    `/api/servicos?incluirInativos=true&_r=${refreshKey}`,
    30000,
  );

  function forcarAtualizacao() {
    setRefreshKey((k) => k + 1);
    setMostrarFormNovo(false);
  }

  if (euEstado.status === 'carregando') {
    return <LoadingState texto="Carregando..." />;
  }
  if (euEstado.status === 'erro') {
    return <ErrorState mensagem={euEstado.mensagem} />;
  }

  const souGerente = euEstado.dados.role === 'gerente';
  const lista = listaEstado.status === 'sucesso' ? listaEstado.dados : [];
  const selecionado = lista.find((s) => s.id === selecionadoId) ?? null;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Serviços</h1>
        {souGerente && (
          <Button onClick={() => setMostrarFormNovo((v) => !v)}>
            {mostrarFormNovo ? 'Cancelar' : 'Novo serviço'}
          </Button>
        )}
      </div>

      {mostrarFormNovo && <FormularioNovoServico onCriado={forcarAtualizacao} />}

      {listaEstado.status === 'carregando' && <LoadingState texto="Carregando..." />}
      {listaEstado.status === 'erro' && <ErrorState mensagem={listaEstado.mensagem} />}

      {listaEstado.status === 'sucesso' && (
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="w-full shrink-0 md:w-64">
            <ul className="flex flex-col gap-1">
              {lista.map((servico) => (
                <li key={servico.id}>
                  <button
                    onClick={() => souGerente && setSelecionadoId(servico.id)}
                    disabled={!souGerente}
                    className={`w-full rounded px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${
                      selecionadoId === servico.id
                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                    } ${!souGerente ? 'hover:bg-transparent dark:hover:bg-transparent' : ''}`}
                  >
                    <div className="font-medium">{servico.nome}</div>
                    <div className="text-xs opacity-75">
                      {servico.duracao_minutos}min · {formatarPreco(servico.preco)}
                      {!servico.ativo ? ' · Desativado' : ''}
                    </div>
                  </button>
                </li>
              ))}
              {lista.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Nenhum serviço cadastrado ainda.
                </p>
              )}
            </ul>
          </div>

          {souGerente && (
            <div className="flex-1">
              {!selecionado && (
                <Card className="flex items-center justify-center py-12">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Selecione um serviço à esquerda.
                  </p>
                </Card>
              )}
              {selecionado && (
                <FormularioServico
                  key={selecionado.id}
                  servico={selecionado}
                  onSalvo={forcarAtualizacao}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
