'use client';

import { useState, FormEvent } from 'react';
import { useApiPolling } from '@/hooks/useApiPolling';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

type Papel = 'gerente' | 'funcionario';

type Funcionario = {
  id: number;
  email: string;
  role: Papel;
  telefone_notificacao: string | null;
  profissional_id: number | null;
  ativo: boolean;
  criado_em: string;
};

type EuMesmo = {
  id: number;
  email: string;
  role: Papel;
};

type Profissional = {
  id: number;
  nome: string;
};

const ROTULOS_PAPEL: Record<Papel, string> = {
  gerente: 'Gerente',
  funcionario: 'Funcionário',
};

function FormularioPerfil({
  funcionario,
  souGerente,
  ehVoceMesmo,
  profissionais,
  onSalvo,
}: {
  funcionario: Funcionario;
  souGerente: boolean;
  ehVoceMesmo: boolean;
  profissionais: Profissional[];
  onSalvo: () => void;
}) {
  const [email, setEmail] = useState(funcionario.email);
  const [telefoneNotificacao, setTelefoneNotificacao] = useState(
    funcionario.telefone_notificacao ?? '',
  );
  const [novaSenha, setNovaSenha] = useState('');
  const [role, setRole] = useState<Papel>(funcionario.role);
  const [profissionalId, setProfissionalId] = useState(
    funcionario.profissional_id ? String(funcionario.profissional_id) : '',
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const corpo: Record<string, unknown> = {
        email,
        telefoneNotificacao: telefoneNotificacao.trim() || null,
      };
      if (novaSenha.trim()) corpo.novaSenha = novaSenha.trim();
      if (souGerente) {
        corpo.role = role;
        corpo.profissionalId = profissionalId ? Number(profissionalId) : null;
      }

      await apiFetch(`/api/funcionarios/${funcionario.id}`, {
        method: 'PATCH',
        body: JSON.stringify(corpo),
      });
      setNovaSenha('');
      onSalvo();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo() {
    const acao = funcionario.ativo ? 'desativar' : 'reativar';
    if (!confirm(`Tem certeza que quer ${acao} ${funcionario.email}?`)) return;

    setErro(null);
    setSalvando(true);
    try {
      await apiFetch(`/api/funcionarios/${funcionario.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ativo: !funcionario.ativo }),
      });
      onSalvo();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir ${funcionario.email} permanentemente? Não dá pra desfazer.`)) return;

    setErro(null);
    setSalvando(true);
    try {
      await apiFetch(`/api/funcionarios/${funcionario.id}`, { method: 'DELETE' });
      onSalvo();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Erro inesperado');
      setSalvando(false);
    }
  }

  return (
    <Card>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          Telefone de notificação
          <input
            type="text"
            value={telefoneNotificacao}
            onChange={(e) => setTelefoneNotificacao(e.target.value)}
            placeholder="5511999999999"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          Nova senha (deixe em branco pra manter a atual)
          <input
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            minLength={8}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        {souGerente && (
          <>
            <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
              Papel
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Papel)}
                disabled={ehVoceMesmo}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="funcionario">Funcionário</option>
                <option value="gerente">Gerente</option>
              </select>
              {ehVoceMesmo && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Você não pode alterar seu próprio papel.
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
              Profissional vinculado (agenda/disponibilidade)
              <select
                value={profissionalId}
                onChange={(e) => setProfissionalId(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="">Nenhum</option>
                {profissionais.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {erro && <ErrorState mensagem={erro} />}

        <div className="mt-2 flex items-center justify-between">
          <Button type="submit" disabled={salvando}>
            Salvar
          </Button>

          {souGerente && !ehVoceMesmo && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={alternarAtivo}
                disabled={salvando}
                className="text-xs text-gray-500 hover:underline disabled:opacity-50 dark:text-gray-400"
              >
                {funcionario.ativo ? 'Desativar' : 'Reativar'}
              </button>
              <button
                type="button"
                onClick={excluir}
                disabled={salvando}
                className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
              >
                Excluir
              </button>
            </div>
          )}
        </div>
      </form>
    </Card>
  );
}

function FormularioNovoFuncionario({
  profissionais,
  onCriado,
}: {
  profissionais: Profissional[];
  onCriado: () => void;
}) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [role, setRole] = useState<Papel>('funcionario');
  const [profissionalId, setProfissionalId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await apiFetch('/api/funcionarios', {
        method: 'POST',
        body: JSON.stringify({
          email,
          senha,
          role,
          profissionalId: profissionalId ? Number(profissionalId) : null,
        }),
      });
      setEmail('');
      setSenha('');
      setRole('funcionario');
      setProfissionalId('');
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
        Novo funcionário
      </h2>
      <form onSubmit={criar} className="flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          required
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha (mín. 8 caracteres)"
          minLength={8}
          required
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Papel)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="funcionario">Funcionário</option>
          <option value="gerente">Gerente</option>
        </select>
        <select
          value={profissionalId}
          onChange={(e) => setProfissionalId(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">Sem profissional vinculado</option>
          {profissionais.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>

        {erro && <ErrorState mensagem={erro} />}

        <Button type="submit" disabled={salvando} className="self-start">
          Criar funcionário
        </Button>
      </form>
    </Card>
  );
}

export default function FuncionariosPage() {
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [mostrarFormNovo, setMostrarFormNovo] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const euEstado = useApiPolling<EuMesmo>('/api/auth/me', 60000);
  const profissionaisEstado = useApiPolling<Profissional[]>('/api/profissionais', 60000);

  const souGerente = euEstado.status === 'sucesso' && euEstado.dados.role === 'gerente';

  const caminhoLista = souGerente ? `/api/funcionarios?_r=${refreshKey}` : null;
  const listaEstado = useApiPolling<Funcionario[]>(caminhoLista, 10000);

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

  const profissionais = profissionaisEstado.status === 'sucesso' ? profissionaisEstado.dados : [];

  // Funcionário comum: só vê e edita o próprio perfil, sem lista nem ações sobre outros.
  if (!souGerente) {
    return (
      <div className="flex max-w-md flex-col gap-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Meu perfil</h1>
        <PerfilProprioFuncionario euId={euEstado.dados.id} />
      </div>
    );
  }

  const lista = listaEstado.status === 'sucesso' ? listaEstado.dados : [];
  const selecionado = lista.find((f) => f.id === selecionadoId) ?? null;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Funcionários</h1>
        <Button onClick={() => setMostrarFormNovo((v) => !v)}>
          {mostrarFormNovo ? 'Cancelar' : 'Novo funcionário'}
        </Button>
      </div>

      {mostrarFormNovo && (
        <FormularioNovoFuncionario profissionais={profissionais} onCriado={forcarAtualizacao} />
      )}

      {listaEstado.status === 'carregando' && <LoadingState texto="Carregando..." />}
      {listaEstado.status === 'erro' && <ErrorState mensagem={listaEstado.mensagem} />}

      {listaEstado.status === 'sucesso' && (
        <div className="flex gap-6">
          <div className="w-64 shrink-0">
            <ul className="flex flex-col gap-1">
              {lista.map((funcionario) => (
                <li key={funcionario.id}>
                  <button
                    onClick={() => setSelecionadoId(funcionario.id)}
                    className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
                      selecionadoId === funcionario.id
                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="font-medium">{funcionario.email}</div>
                    <div className="text-xs opacity-75">
                      {ROTULOS_PAPEL[funcionario.role]}
                      {!funcionario.ativo ? ' · Desativado' : ''}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex-1">
            {!selecionado && (
              <Card className="flex items-center justify-center py-12">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Selecione um funcionário à esquerda.
                </p>
              </Card>
            )}
            {selecionado && (
              <FormularioPerfil
                key={selecionado.id}
                funcionario={selecionado}
                souGerente
                ehVoceMesmo={selecionado.id === euEstado.dados.id}
                profissionais={profissionais}
                onSalvo={forcarAtualizacao}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PerfilProprioFuncionario({ euId }: { euId: number }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const funcionarioEstado = useApiPolling<Funcionario>(
    `/api/funcionarios/${euId}?_r=${refreshKey}`,
    30000,
  );

  if (funcionarioEstado.status === 'carregando') {
    return <LoadingState texto="Carregando..." />;
  }
  if (funcionarioEstado.status === 'erro') {
    return <ErrorState mensagem={funcionarioEstado.mensagem} />;
  }

  return (
    <FormularioPerfil
      funcionario={funcionarioEstado.dados}
      souGerente={false}
      ehVoceMesmo
      profissionais={[]}
      onSalvo={() => setRefreshKey((k) => k + 1)}
    />
  );
}
