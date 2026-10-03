'use client';

import { useState, FormEvent } from 'react';
import { useApiPolling } from '@/hooks/useApiPolling';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

type Profissional = {
  id: number;
  nome: string;
  telefone_contato: string | null;
  ativo: boolean;
  antecedencia_minima_horas: number;
};

type ProfissionalComServicos = Profissional & { servicoIds: number[] };

type Servico = {
  id: number;
  nome: string;
};

type EuMesmo = {
  id: number;
  email: string;
  role: 'gerente' | 'funcionario';
};

function ListaServicosCheckbox({
  servicos,
  selecionados,
  onMudar,
}: {
  servicos: Servico[];
  selecionados: number[];
  onMudar: (servicoIds: number[]) => void;
}) {
  function alternar(servicoId: number) {
    if (selecionados.includes(servicoId)) {
      onMudar(selecionados.filter((id) => id !== servicoId));
    } else {
      onMudar([...selecionados, servicoId]);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-gray-700 dark:text-gray-300">Serviços que atende</span>
      {servicos.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">Nenhum serviço cadastrado ainda.</p>
      )}
      <div className="flex flex-col gap-1 rounded-md border border-gray-200 p-2 dark:border-gray-700">
        {servicos.map((servico) => (
          <label
            key={servico.id}
            className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
          >
            <input
              type="checkbox"
              checked={selecionados.includes(servico.id)}
              onChange={() => alternar(servico.id)}
              className="h-4 w-4"
            />
            {servico.nome}
          </label>
        ))}
      </div>
    </div>
  );
}

function FormularioProfissional({
  profissional,
  servicos,
  onSalvo,
}: {
  profissional: ProfissionalComServicos;
  servicos: Servico[];
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(profissional.nome);
  const [telefoneContato, setTelefoneContato] = useState(profissional.telefone_contato ?? '');
  const [servicoIds, setServicoIds] = useState<number[]>(profissional.servicoIds);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await apiFetch(`/api/profissionais/${profissional.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nome,
          telefoneContato: telefoneContato.trim() || null,
          servicoIds,
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
    const acao = profissional.ativo ? 'desativar' : 'reativar';
    if (!confirm(`Tem certeza que quer ${acao} "${profissional.nome}"?`)) return;

    setErro(null);
    setSalvando(true);
    try {
      await apiFetch(`/api/profissionais/${profissional.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ativo: !profissional.ativo }),
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
          Telefone de contato (opcional)
          <input
            type="text"
            value={telefoneContato}
            onChange={(e) => setTelefoneContato(e.target.value)}
            placeholder="5511999999999"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <ListaServicosCheckbox servicos={servicos} selecionados={servicoIds} onMudar={setServicoIds} />

        <p className="text-xs text-gray-400 dark:text-gray-500">
          Dias de atendimento, horários, bloqueios e antecedência mínima ficam em{' '}
          <a href="/painel/disponibilidade" className="underline">
            Disponibilidade
          </a>
          .
        </p>

        {!profissional.ativo && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Este profissional está desativado — não aparece como opção pra novos agendamentos nem
            pra vincular funcionários, mas agendamentos já existentes com ele continuam normais.
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
            {profissional.ativo ? 'Desativar' : 'Reativar'}
          </button>
        </div>
      </form>
    </Card>
  );
}

function DetalheProfissional({
  profissionalId,
  servicos,
  onSalvo,
}: {
  profissionalId: number;
  servicos: Servico[];
  onSalvo: () => void;
}) {
  const detalheEstado = useApiPolling<ProfissionalComServicos>(
    `/api/profissionais/${profissionalId}`,
    30000,
  );

  if (detalheEstado.status === 'carregando') {
    return <LoadingState texto="Carregando..." />;
  }
  if (detalheEstado.status === 'erro') {
    return <ErrorState mensagem={detalheEstado.mensagem} />;
  }

  return (
    <FormularioProfissional
      key={detalheEstado.dados.id}
      profissional={detalheEstado.dados}
      servicos={servicos}
      onSalvo={onSalvo}
    />
  );
}

function FormularioNovoProfissional({
  servicos,
  onCriado,
}: {
  servicos: Servico[];
  onCriado: () => void;
}) {
  const [nome, setNome] = useState('');
  const [telefoneContato, setTelefoneContato] = useState('');
  const [servicoIds, setServicoIds] = useState<number[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await apiFetch('/api/profissionais', {
        method: 'POST',
        body: JSON.stringify({
          nome,
          telefoneContato: telefoneContato.trim() || null,
          servicoIds,
        }),
      });
      setNome('');
      setTelefoneContato('');
      setServicoIds([]);
      onCriado();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
        Novo profissional
      </h2>
      <form onSubmit={criar} className="flex flex-col gap-3">
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome"
          required
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          type="text"
          value={telefoneContato}
          onChange={(e) => setTelefoneContato(e.target.value)}
          placeholder="Telefone de contato (opcional)"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />

        <ListaServicosCheckbox servicos={servicos} selecionados={servicoIds} onMudar={setServicoIds} />

        {erro && <ErrorState mensagem={erro} />}

        <Button type="submit" disabled={salvando} className="self-start">
          Criar profissional
        </Button>
      </form>
    </Card>
  );
}

export default function ProfissionaisPage() {
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [mostrarFormNovo, setMostrarFormNovo] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const euEstado = useApiPolling<EuMesmo>('/api/auth/me', 60000);
  const listaEstado = useApiPolling<Profissional[]>(
    `/api/profissionais?incluirInativos=true&_r=${refreshKey}`,
    30000,
  );
  const servicosEstado = useApiPolling<Servico[]>('/api/servicos', 60000);

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
  const servicos = servicosEstado.status === 'sucesso' ? servicosEstado.dados : [];

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Profissionais</h1>
        {souGerente && (
          <Button onClick={() => setMostrarFormNovo((v) => !v)}>
            {mostrarFormNovo ? 'Cancelar' : 'Novo profissional'}
          </Button>
        )}
      </div>

      {mostrarFormNovo && (
        <FormularioNovoProfissional servicos={servicos} onCriado={forcarAtualizacao} />
      )}

      {listaEstado.status === 'carregando' && <LoadingState texto="Carregando..." />}
      {listaEstado.status === 'erro' && <ErrorState mensagem={listaEstado.mensagem} />}

      {listaEstado.status === 'sucesso' && (
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="w-full shrink-0 md:w-64">
            <ul className="flex flex-col gap-1">
              {lista.map((profissional) => (
                <li key={profissional.id}>
                  <button
                    onClick={() => souGerente && setSelecionadoId(profissional.id)}
                    disabled={!souGerente}
                    className={`w-full rounded px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${
                      selecionadoId === profissional.id
                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                    } ${!souGerente ? 'hover:bg-transparent dark:hover:bg-transparent' : ''}`}
                  >
                    <div className="font-medium">{profissional.nome}</div>
                    <div className="text-xs opacity-75">
                      {profissional.telefone_contato ?? 'Sem telefone'}
                      {!profissional.ativo ? ' · Desativado' : ''}
                    </div>
                  </button>
                </li>
              ))}
              {lista.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Nenhum profissional cadastrado ainda.
                </p>
              )}
            </ul>
          </div>

          {souGerente && (
            <div className="flex-1">
              {!selecionadoId && (
                <Card className="flex items-center justify-center py-12">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Selecione um profissional à esquerda.
                  </p>
                </Card>
              )}
              {selecionadoId && (
                <DetalheProfissional
                  profissionalId={selecionadoId}
                  servicos={servicos}
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
