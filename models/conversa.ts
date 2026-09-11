import { pool } from '@/infra/database';
import { enviarMensagemTexto, enviarMensagemBotoes } from '@/infra/whatsapp';

const TIMEOUT_MINUTOS = 10;

const BOTOES_MENU = [
  { id: 'menu_agendar', titulo: 'Agendar horário' },
  { id: 'menu_ver_agendamentos', titulo: 'Ver agendamentos' },
  { id: 'menu_atendente', titulo: 'Falar com atendente' },
];

const BOTAO_VOLTAR = [{ id: 'voltar_menu', titulo: 'Voltar' }];

type EstadoConversa = {
  id: number;
  telefone: string;
  estado: string;
  contexto: Record<string, unknown> | null;
  atualizado_em: string;
};

type Entrada = { tipo: 'texto'; valor: string } | { tipo: 'botao'; id: string };

async function buscarOuCriarConversa(
  telefone: string,
): Promise<{ conversa: EstadoConversa; novaConversa: boolean }> {
  const { rows } = await pool.query(`SELECT * FROM conversas WHERE telefone = $1`, [telefone]);

  if (rows.length > 0) {
    return { conversa: rows[0], novaConversa: false };
  }

  const { rows: criadas } = await pool.query(
    `INSERT INTO conversas (telefone, estado) VALUES ($1, 'menu') RETURNING *`,
    [telefone],
  );
  return { conversa: criadas[0], novaConversa: true };
}

async function atualizarEstado(telefone: string, novoEstado: string) {
  await pool.query(
    `UPDATE conversas SET estado = $1, atualizado_em = now() WHERE telefone = $2`,
    [novoEstado, telefone],
  );
}

function conversaExpirou(conversa: EstadoConversa): boolean {
  const minutosSemInteracao =
    (Date.now() - new Date(conversa.atualizado_em).getTime()) / 1000 / 60;
  return minutosSemInteracao > TIMEOUT_MINUTOS;
}

async function enviarMenu(telefone: string, saudacao = '') {
  await enviarMensagemBotoes({
    telefone,
    corpo: `${saudacao}O que você deseja fazer?`,
    botoes: BOTOES_MENU,
  });
}

export async function processarMensagem(telefone: string, entrada: Entrada) {
  const { conversa, novaConversa } = await buscarOuCriarConversa(telefone);

  const cliqueVoltar = entrada.tipo === 'botao' && entrada.id === 'voltar_menu';
  const precisaResetar = novaConversa || cliqueVoltar || conversaExpirou(conversa);

  if (precisaResetar) {
    await atualizarEstado(telefone, 'menu');
    await enviarMenu(telefone, novaConversa ? 'Olá! ' : '');
    return;
  }

  switch (conversa.estado) {
    case 'menu':
      await processarMenu(telefone, entrada);
      break;

    case 'fluxo_agendamento':
      await enviarMensagemBotoes({
        telefone,
        corpo: 'Fluxo de agendamento ainda em construção.',
        botoes: BOTAO_VOLTAR,
      });
      break;

    case 'fluxo_ver_agendamentos':
      await enviarMensagemBotoes({
        telefone,
        corpo: 'Consulta de agendamentos ainda em construção.',
        botoes: BOTAO_VOLTAR,
      });
      break;

    case 'aguardando_atendente':
      await enviarMensagemBotoes({
        telefone,
        corpo: 'Um atendente vai falar com você em breve.',
        botoes: BOTAO_VOLTAR,
      });
      break;

    default:
      await atualizarEstado(telefone, 'menu');
      await enviarMenu(telefone);
  }
}

async function processarMenu(telefone: string, entrada: Entrada) {
  if (entrada.tipo === 'botao') {
    switch (entrada.id) {
      case 'menu_agendar':
        await atualizarEstado(telefone, 'fluxo_agendamento');
        await enviarMensagemBotoes({
          telefone,
          corpo: 'Vamos agendar! (fluxo em construção)',
          botoes: BOTAO_VOLTAR,
        });
        return;
      case 'menu_ver_agendamentos':
        await atualizarEstado(telefone, 'fluxo_ver_agendamentos');
        await enviarMensagemBotoes({
          telefone,
          corpo: 'Buscando seus agendamentos... (fluxo em construção)',
          botoes: BOTAO_VOLTAR,
        });
        return;
      case 'menu_atendente':
        await atualizarEstado(telefone, 'aguardando_atendente');
        await enviarMensagemBotoes({
          telefone,
          corpo: 'Ok, vou te conectar com um atendente. (fluxo em construção)',
          botoes: BOTAO_VOLTAR,
        });
        return;
    }
  }

  await enviarMensagemTexto(telefone, 'Por favor, escolha uma das opções abaixo:');
  await enviarMenu(telefone);
}
