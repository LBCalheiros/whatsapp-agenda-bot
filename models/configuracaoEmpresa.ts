import { pool } from '@/infra/database';
import { logger } from '@/infra/logger';

// os limites das mensagens respeitam o corpo dos botões do WhatsApp (1024 caracteres),
// que recebe a mensagem inicial junto com a pergunta do menu
export const LIMITES_CONFIGURACAO = {
  nome: 100,
  telefone: 30,
  endereco: 200,
  mensagem_inicial: 500,
  mensagem_confirmacao: 500,
  mensagem_encerramento: 500,
} as const;

export type CampoConfiguracao = keyof typeof LIMITES_CONFIGURACAO;

export type ConfiguracaoEmpresa = Record<CampoConfiguracao, string | null> & {
  atualizado_em: Date | null;
};

const CAMPOS = Object.keys(LIMITES_CONFIGURACAO) as CampoConfiguracao[];

const COLUNAS = `nome, telefone, endereco, mensagem_inicial, mensagem_confirmacao,
  mensagem_encerramento, atualizado_em`;

function configuracaoVazia(): ConfiguracaoEmpresa {
  return {
    nome: null,
    telefone: null,
    endereco: null,
    mensagem_inicial: null,
    mensagem_confirmacao: null,
    mensagem_encerramento: null,
    atualizado_em: null,
  };
}

function normalizar(valor: string | null): string | null {
  const texto = valor?.trim();
  return texto ? texto : null;
}

export async function obterConfiguracaoEmpresa(): Promise<ConfiguracaoEmpresa> {
  const { rows } = await pool.query(`SELECT ${COLUNAS} FROM configuracoes_empresa WHERE id = 1`);
  return rows[0] ?? configuracaoVazia();
}

// o bot não pode parar de responder por causa de uma falha ao ler as configurações:
// nesse caso ele cai nos textos padrão
export async function obterConfiguracaoEmpresaSegura(): Promise<ConfiguracaoEmpresa> {
  try {
    return await obterConfiguracaoEmpresa();
  } catch (error) {
    logger.error({ error }, 'Falha ao ler as configurações da empresa; usando textos padrão');
    return configuracaoVazia();
  }
}

// só atualiza os campos enviados; texto vazio ou null limpa o campo (volta ao padrão)
export async function atualizarConfiguracaoEmpresa(
  dados: Partial<Record<CampoConfiguracao, string | null>>,
): Promise<ConfiguracaoEmpresa> {
  const campos = CAMPOS.filter((campo) => dados[campo] !== undefined);

  if (campos.length === 0) {
    return obterConfiguracaoEmpresa();
  }

  const valores = campos.map((campo) => normalizar(dados[campo] ?? null));
  const placeholders = campos.map((_, indice) => `$${indice + 1}`).join(', ');
  const atualizacoes = campos.map((campo, indice) => `${campo} = $${indice + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO configuracoes_empresa (id, ${campos.join(', ')})
     VALUES (1, ${placeholders})
     ON CONFLICT (id) DO UPDATE SET ${atualizacoes}, atualizado_em = now()
     RETURNING ${COLUNAS}`,
    valores,
  );

  return rows[0];
}
