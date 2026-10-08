'use client';

import { useState, FormEvent } from 'react';
import { useApi } from '@/hooks/useApi';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { ENCERRAMENTO_PADRAO, SAUDACAO_PADRAO } from '@/lib/mensagensPadrao';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

type Configuracao = {
  nome: string | null;
  telefone: string | null;
  endereco: string | null;
  mensagem_inicial: string | null;
  mensagem_confirmacao: string | null;
  mensagem_encerramento: string | null;
};

type EuMesmo = {
  id: number;
  email: string;
  role: 'gerente' | 'funcionario';
};

const estiloCampo =
  'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

function Campo({
  rotulo,
  ajuda,
  valor,
  onChange,
  limite,
  placeholder,
  multilinha = false,
  desabilitado,
}: {
  rotulo: string;
  ajuda?: string;
  valor: string;
  onChange: (valor: string) => void;
  limite: number;
  placeholder?: string;
  multilinha?: boolean;
  desabilitado: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
      {rotulo}
      {multilinha ? (
        <textarea
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          maxLength={limite}
          rows={3}
          placeholder={placeholder}
          disabled={desabilitado}
          className={estiloCampo}
        />
      ) : (
        <input
          type="text"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          maxLength={limite}
          placeholder={placeholder}
          disabled={desabilitado}
          className={estiloCampo}
        />
      )}
      <span className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>{ajuda}</span>
        <span>
          {valor.length}/{limite}
        </span>
      </span>
    </label>
  );
}

function FormularioConfiguracoes({
  inicial,
  somenteLeitura,
}: {
  inicial: Configuracao;
  somenteLeitura: boolean;
}) {
  const [nome, setNome] = useState(inicial.nome ?? '');
  const [telefone, setTelefone] = useState(inicial.telefone ?? '');
  const [endereco, setEndereco] = useState(inicial.endereco ?? '');
  const [mensagemInicial, setMensagemInicial] = useState(inicial.mensagem_inicial ?? '');
  const [mensagemConfirmacao, setMensagemConfirmacao] = useState(
    inicial.mensagem_confirmacao ?? '',
  );
  const [mensagemEncerramento, setMensagemEncerramento] = useState(
    inicial.mensagem_encerramento ?? '',
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSucesso(false);
    setSalvando(true);
    try {
      await apiFetch('/api/configuracoes', {
        method: 'PUT',
        body: JSON.stringify({
          nome,
          telefone,
          endereco,
          mensagem_inicial: mensagemInicial,
          mensagem_confirmacao: mensagemConfirmacao,
          mensagem_encerramento: mensagemEncerramento,
        }),
      });
      setSucesso(true);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Erro inesperado');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dados da empresa</h2>
        <Campo
          rotulo="Nome"
          valor={nome}
          onChange={setNome}
          limite={100}
          desabilitado={somenteLeitura}
        />
        <Campo
          rotulo="Telefone"
          valor={telefone}
          onChange={setTelefone}
          limite={30}
          desabilitado={somenteLeitura}
        />
        <Campo
          rotulo="Endereço"
          valor={endereco}
          onChange={setEndereco}
          limite={200}
          desabilitado={somenteLeitura}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Mensagens do WhatsApp
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Deixe em branco para usar o texto padrão. O lembrete de 24h é um template aprovado na Meta
          e não é editado aqui.
        </p>
        <Campo
          rotulo="Mensagem inicial"
          ajuda="Substitui o cumprimento no primeiro contato do cliente, antes das opções do menu."
          valor={mensagemInicial}
          onChange={setMensagemInicial}
          limite={500}
          placeholder={SAUDACAO_PADRAO}
          multilinha
          desabilitado={somenteLeitura}
        />
        <Campo
          rotulo="Mensagem de confirmação"
          ajuda="Enviada junto da confirmação de um novo agendamento, depois da data, do horário e das regras de cancelamento."
          valor={mensagemConfirmacao}
          onChange={setMensagemConfirmacao}
          limite={500}
          placeholder="Ex: Estamos na Rua X, 123. Chegue 5 minutos antes."
          multilinha
          desabilitado={somenteLeitura}
        />
        <Campo
          rotulo="Mensagem de encerramento"
          ajuda="Enviada ao cliente quando um atendente encerra o atendimento humano."
          valor={mensagemEncerramento}
          onChange={setMensagemEncerramento}
          limite={500}
          placeholder={ENCERRAMENTO_PADRAO}
          multilinha
          desabilitado={somenteLeitura}
        />
      </Card>

      {erro && <ErrorState mensagem={erro} />}
      {sucesso && (
        <p className="text-sm text-green-700 dark:text-green-400">Configurações salvas.</p>
      )}

      {somenteLeitura ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Só gerentes podem alterar as configurações.
        </p>
      ) : (
        <div>
          <Button type="submit" disabled={salvando}>
            Salvar configurações
          </Button>
        </div>
      )}
    </form>
  );
}

export default function ConfiguracoesPage() {
  const configuracaoEstado = useApi<Configuracao>('/api/configuracoes');
  const euEstado = useApi<EuMesmo>('/api/auth/me');

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Configurações</h1>

      {(configuracaoEstado.status === 'carregando' || euEstado.status === 'carregando') && (
        <LoadingState />
      )}
      {configuracaoEstado.status === 'erro' && (
        <ErrorState mensagem={configuracaoEstado.mensagem} />
      )}
      {euEstado.status === 'erro' && <ErrorState mensagem={euEstado.mensagem} />}

      {configuracaoEstado.status === 'sucesso' && euEstado.status === 'sucesso' && (
        <FormularioConfiguracoes
          inicial={configuracaoEstado.dados}
          somenteLeitura={euEstado.dados.role !== 'gerente'}
        />
      )}
    </div>
  );
}
