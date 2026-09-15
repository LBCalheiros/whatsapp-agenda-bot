import { pool } from '@/infra/database';
import { enviarMensagemTexto, enviarMensagemBotoes } from '@/infra/whatsapp';
import { AppError } from '@/infra/errors';
import { buscarOuCriarClientePorTelefone } from '@/models/cliente';
import { consultarHorariosDisponiveis } from '@/models/disponibilidade';
import {
  ANTECEDENCIA_MINIMA_HORAS,
  criarAgendamento,
  cancelarComoCliente,
  listarAgendamentos,
} from '@/models/agendamento';

const TIMEOUT_MINUTOS = 10;
const FUSO_HORARIO = 'America/Sao_Paulo';
const DIAS_BUSCA_HORARIOS = 7;
const MAX_HORARIOS_EXIBIDOS = 3;

const BOTOES_MENU = [
  { id: 'menu_agendar', titulo: 'Agendar horário' },
  { id: 'menu_ver_agendamentos', titulo: 'Ver agendamentos' },
  { id: 'menu_atendente', titulo: 'Falar com atendente' },
];

const BOTAO_VOLTAR = [{ id: 'voltar_menu', titulo: 'Voltar' }];
const BOTAO_ATENDENTE_E_VOLTAR = [
  { id: 'menu_atendente', titulo: 'Falar com atendente' },
  ...BOTAO_VOLTAR,
];

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

async function atualizarEstado(
  telefone: string,
  novoEstado: string,
  contexto: Record<string, unknown> | null = null,
) {
  await pool.query(
    `UPDATE conversas SET estado = $1, contexto = $2, atualizado_em = now() WHERE telefone = $3`,
    [novoEstado, contexto ? JSON.stringify(contexto) : null, telefone],
  );
}

const ESTADOS_COM_CONTEXTO_TEMPORAL = [
  'fluxo_agendamento_escolhendo_horario',
  'fluxo_agendamento_confirmando',
  'fluxo_ver_agendamentos',
];

function conversaExpirou(conversa: EstadoConversa): boolean {
  if (!ESTADOS_COM_CONTEXTO_TEMPORAL.includes(conversa.estado)) return false;
  const minutosSemInteracao = (Date.now() - new Date(conversa.atualizado_em).getTime()) / 1000 / 60;
  return minutosSemInteracao > TIMEOUT_MINUTOS;
}

function formatarDataHora(data: Date): string {
  return data.toLocaleString('pt-BR', {
    timeZone: FUSO_HORARIO,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const expirou = conversaExpirou(conversa);
  const precisaResetar = novaConversa || cliqueVoltar || expirou;

  if (precisaResetar) {
    await atualizarEstado(telefone, 'menu');
    const saudacao = novaConversa
      ? 'Olá! '
      : expirou
        ? 'Faz um tempo que você não responde, vamos recomeçar. '
        : '';
    await enviarMenu(telefone, saudacao);
    return;
  }

  switch (conversa.estado) {
    case 'menu':
      await processarMenu(telefone, entrada);
      break;

    case 'fluxo_agendamento_escolhendo_horario':
      await processarEscolhaHorario(telefone, entrada, conversa.contexto);
      break;

    case 'fluxo_agendamento_confirmando':
      await processarConfirmacao(telefone, entrada, conversa.contexto);
      break;

    case 'fluxo_ver_agendamentos':
      await processarCancelamento(telefone, entrada, conversa.contexto);
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
        await iniciarFluxoAgendamento(telefone);
        return;
      case 'menu_ver_agendamentos':
        await iniciarFluxoVerAgendamentos(telefone);
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

async function obterProfissionalEServicoPadrao(): Promise<{
  profissionalId: number;
  servicoId: number;
  duracaoMinutos: number;
} | null> {
  const { rows: profissionais } = await pool.query(
    `SELECT id FROM profissionais WHERE ativo = true ORDER BY id LIMIT 1`,
  );
  const { rows: servicos } = await pool.query(
    `SELECT id, duracao_minutos FROM servicos WHERE ativo = true ORDER BY id LIMIT 1`,
  );

  if (profissionais.length === 0 || servicos.length === 0) return null;

  return {
    profissionalId: profissionais[0].id,
    servicoId: servicos[0].id,
    duracaoMinutos: servicos[0].duracao_minutos,
  };
}

async function buscarProximosHorarios(
  profissionalId: number,
  duracaoMinutos: number,
): Promise<Date[]> {
  const agora = Date.now();
  const antecedenciaMinimaMs = ANTECEDENCIA_MINIMA_HORAS * 60 * 60 * 1000;
  const encontrados: Date[] = [];

  for (let i = 0; i < DIAS_BUSCA_HORARIOS && encontrados.length < MAX_HORARIOS_EXIBIDOS; i++) {
    const dia = new Date(agora + i * 24 * 60 * 60 * 1000);
    const horarios = await consultarHorariosDisponiveis(profissionalId, dia, duracaoMinutos);

    for (const horario of horarios) {
      if (encontrados.length >= MAX_HORARIOS_EXIBIDOS) break;
      if (horario.getTime() - agora >= antecedenciaMinimaMs) {
        encontrados.push(horario);
      }
    }
  }

  return encontrados;
}

async function iniciarFluxoAgendamento(telefone: string) {
  const padrao = await obterProfissionalEServicoPadrao();

  if (!padrao) {
    await enviarMensagemBotoes({
      telefone,
      corpo: 'No momento não há profissionais ou serviços configurados.',
      botoes: BOTAO_ATENDENTE_E_VOLTAR,
    });
    await atualizarEstado(telefone, 'menu');
    return;
  }

  await exibirHorariosDisponiveis(
    telefone,
    padrao.profissionalId,
    padrao.servicoId,
    padrao.duracaoMinutos,
  );
}

async function exibirHorariosDisponiveis(
  telefone: string,
  profissionalId: number,
  servicoId: number,
  duracaoMinutos: number,
) {
  const horarios = await buscarProximosHorarios(profissionalId, duracaoMinutos);

  if (horarios.length === 0) {
    await enviarMensagemBotoes({
      telefone,
      corpo: `Não há horários disponíveis nos próximos ${DIAS_BUSCA_HORARIOS} dias.`,
      botoes: BOTAO_ATENDENTE_E_VOLTAR,
    });
    await atualizarEstado(telefone, 'menu');
    return;
  }

  await atualizarEstado(telefone, 'fluxo_agendamento_escolhendo_horario', {
    profissionalId,
    servicoId,
    duracaoMinutos,
  });

  await enviarMensagemBotoes({
    telefone,
    corpo: 'Escolha um horário:',
    botoes: horarios.map((horario) => ({
      id: `slot_${horario.toISOString()}`,
      titulo: formatarDataHora(horario),
    })),
  });
}

async function processarEscolhaHorario(
  telefone: string,
  entrada: Entrada,
  contexto: Record<string, unknown> | null,
) {
  if (entrada.tipo !== 'botao' || !entrada.id.startsWith('slot_')) {
    await enviarMensagemTexto(
      telefone,
      'Por favor, escolha um dos horários enviados, ou toque em Voltar.',
    );
    return;
  }

  const dataHoraIso = entrada.id.slice('slot_'.length);
  const profissionalId = contexto?.profissionalId as number;
  const servicoId = contexto?.servicoId as number;
  const duracaoMinutos = contexto?.duracaoMinutos as number;

  await atualizarEstado(telefone, 'fluxo_agendamento_confirmando', {
    profissionalId,
    servicoId,
    duracaoMinutos,
    dataHora: dataHoraIso,
  });

  await enviarMensagemBotoes({
    telefone,
    corpo: `Confirmar agendamento para ${formatarDataHora(new Date(dataHoraIso))}?`,
    botoes: [
      { id: 'confirmar_agendamento', titulo: 'Confirmar' },
      { id: 'abortar_agendamento', titulo: 'Escolher outro' },
    ],
  });
}

async function processarConfirmacao(
  telefone: string,
  entrada: Entrada,
  contexto: Record<string, unknown> | null,
) {
  const profissionalId = contexto?.profissionalId as number;
  const servicoId = contexto?.servicoId as number;
  const duracaoMinutos = contexto?.duracaoMinutos as number;
  const dataHoraIso = contexto?.dataHora as string;

  if (entrada.tipo === 'botao' && entrada.id === 'abortar_agendamento') {
    await exibirHorariosDisponiveis(telefone, profissionalId, servicoId, duracaoMinutos);
    return;
  }

  if (entrada.tipo !== 'botao' || entrada.id !== 'confirmar_agendamento') {
    await enviarMensagemTexto(telefone, 'Por favor, toque em Confirmar ou Escolher outro.');
    return;
  }

  try {
    const cliente = await buscarOuCriarClientePorTelefone(telefone);
    await criarAgendamento({
      clienteId: cliente.id,
      profissionalId,
      servicoId,
      dataHora: new Date(dataHoraIso),
    });

    await atualizarEstado(telefone, 'menu');
    await enviarMensagemTexto(
      telefone,
      `Agendamento confirmado para ${formatarDataHora(new Date(dataHoraIso))}. ✅`,
    );
    await enviarMenu(telefone);
  } catch (error) {
    if (error instanceof AppError) {
      await enviarMensagemTexto(telefone, error.message);
      await exibirHorariosDisponiveis(telefone, profissionalId, servicoId, duracaoMinutos);
      return;
    }
    throw error;
  }
}

const MAX_AGENDAMENTOS_CANCELAVEIS = 2;

async function iniciarFluxoVerAgendamentos(telefone: string) {
  const { rows: clientes } = await pool.query(`SELECT id FROM clientes WHERE telefone = $1`, [
    telefone,
  ]);

  if (clientes.length === 0) {
    await enviarMensagemBotoes({
      telefone,
      corpo: 'Você ainda não tem nenhum agendamento.',
      botoes: BOTAO_VOLTAR,
    });
    await atualizarEstado(telefone, 'menu');
    return;
  }

  const agendamentos = await listarAgendamentos({
    clienteId: clientes[0].id,
    apenasFuturos: true,
  });

  if (agendamentos.length === 0) {
    await enviarMensagemBotoes({
      telefone,
      corpo: 'Você não tem agendamentos futuros.',
      botoes: BOTAO_VOLTAR,
    });
    await atualizarEstado(telefone, 'menu');
    return;
  }

  const canceláveis = agendamentos.slice(0, MAX_AGENDAMENTOS_CANCELAVEIS);

  const lista = agendamentos
    .map((a) => `• ${formatarDataHora(new Date(a.data_hora))} — ${a.servico_nome}`)
    .join('\n');

  const aviso =
    agendamentos.length > MAX_AGENDAMENTOS_CANCELAVEIS
      ? `\n\nMostrando os ${MAX_AGENDAMENTOS_CANCELAVEIS} mais próximos pra cancelar por aqui. Pra cancelar os outros, fale com um atendente.`
      : '';

  await atualizarEstado(telefone, 'fluxo_ver_agendamentos', {
    agendamentoIds: canceláveis.map((a) => a.id),
  });

  await enviarMensagemBotoes({
    telefone,
    corpo: `Seus agendamentos:\n${lista}${aviso}\n\nToque em um horário abaixo pra cancelar:`,
    botoes: [
      ...canceláveis.map((a) => ({
        id: `cancelar_agendamento_${a.id}`,
        titulo: formatarDataHora(new Date(a.data_hora)),
      })),
      ...BOTAO_VOLTAR,
    ],
  });
}

async function processarCancelamento(
  telefone: string,
  entrada: Entrada,
  contexto: Record<string, unknown> | null,
) {
  const agendamentoIds = (contexto?.agendamentoIds as number[]) ?? [];

  if (entrada.tipo !== 'botao' || !entrada.id.startsWith('cancelar_agendamento_')) {
    await enviarMensagemTexto(
      telefone,
      'Por favor, toque em um dos horários enviados, ou em Voltar.',
    );
    return;
  }

  const agendamentoId = Number(entrada.id.slice('cancelar_agendamento_'.length));

  if (!agendamentoIds.includes(agendamentoId)) {
    await enviarMensagemTexto(
      telefone,
      'Esse agendamento não está mais disponível pra cancelar por aqui.',
    );
    await atualizarEstado(telefone, 'menu');
    await enviarMenu(telefone);
    return;
  }

  try {
    await cancelarComoCliente(agendamentoId);
    await atualizarEstado(telefone, 'menu');
    await enviarMensagemTexto(telefone, 'Agendamento cancelado. ✅');
    await enviarMenu(telefone);
  } catch (error) {
    if (error instanceof AppError) {
      await enviarMensagemTexto(telefone, error.message);
      await atualizarEstado(telefone, 'menu');
      await enviarMenu(telefone);
      return;
    }
    throw error;
  }
}
