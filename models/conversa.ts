import { pool } from '@/infra/database';
import { enviarMensagemTexto, enviarMensagemBotoes } from '@/infra/whatsapp';
import { AppError } from '@/infra/errors';
import { comLockDeConversa } from '@/infra/lockConversa';
import { formatarDataHora, paraHorarioLocal } from '@/infra/data';
import { buscarOuCriarClientePorTelefone } from '@/models/cliente';
import {
  consultarHorariosDisponiveisParaServico,
  obterProfissionalDisponivel,
} from '@/models/disponibilidade';
import {
  criarAgendamento,
  cancelarComoCliente,
  reagendarAgendamento,
  listarAgendamentos,
  buscarPorId,
} from '@/models/agendamento';
import {
  buscarAtendimentoAbertoPorTelefone,
  iniciarAtendimento,
  registrarMensagem,
} from '@/models/atendimento';
import { logger } from '@/infra/logger';

const TIMEOUT_MINUTOS = 10;
const DIAS_BUSCA_HORARIOS = 7;
const MAX_HORARIOS_EXIBIDOS = 3; // limite de botões por mensagem interativa do WhatsApp
const MAX_AGENDAMENTOS_LISTADOS = 2; // + botão Voltar = 3, limite de botões do WhatsApp

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

// só esses estados têm contexto que pode ficar desatualizado (horários já oferecidos,
// agendamento específico em foco); 'menu' e 'aguardando_atendente' não têm nada a perder
// esperando, então um clique atrasado neles ainda deve ser processado normalmente.
const ESTADOS_COM_CONTEXTO_TEMPORAL = [
  'fluxo_agendamento_escolhendo_servico',
  'fluxo_agendamento_escolhendo_horario',
  'fluxo_agendamento_confirmando',
  'fluxo_ver_agendamentos',
  'fluxo_agendamento_acao',
  'fluxo_cancelamento_confirmando',
  'fluxo_remarcar_escolhendo_horario',
  'fluxo_remarcar_confirmando',
];

function conversaExpirou(conversa: EstadoConversa): boolean {
  if (!ESTADOS_COM_CONTEXTO_TEMPORAL.includes(conversa.estado)) return false;
  const minutosSemInteracao = (Date.now() - new Date(conversa.atualizado_em).getTime()) / 1000 / 60;
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
  return comLockDeConversa(telefone, () => processarMensagemInterna(telefone, entrada));
}

async function processarMensagemInterna(telefone: string, entrada: Entrada) {
  const atendimentoAberto = await buscarAtendimentoAbertoPorTelefone(telefone);
  if (atendimentoAberto) {
    // cliente em atendimento humano: tudo que ele manda vira mensagem no ticket,
    // o bot não processa nada disso (nem menu, nem atalhos do lembrete)
    const texto =
      entrada.tipo === 'texto' ? entrada.valor : `[cliente tocou em um botão: ${entrada.id}]`;
    await registrarMensagem(atendimentoAberto.id, 'cliente', texto);
    return;
  }

  if (entrada.tipo === 'botao' && entrada.id.startsWith('lembrete_cancelar_')) {
    await processarGatilhoLembrete(
      telefone,
      Number(entrada.id.slice('lembrete_cancelar_'.length)),
      'cancelar',
    );
    return;
  }

  if (entrada.tipo === 'botao' && entrada.id.startsWith('lembrete_remarcar_')) {
    await processarGatilhoLembrete(
      telefone,
      Number(entrada.id.slice('lembrete_remarcar_'.length)),
      'remarcar',
    );
    return;
  }

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

    case 'fluxo_agendamento_escolhendo_servico':
      await processarEscolhaServico(telefone, entrada);
      break;

    case 'fluxo_agendamento_escolhendo_horario':
      await processarEscolhaHorario(telefone, entrada, conversa.contexto);
      break;

    case 'fluxo_agendamento_confirmando':
      await processarConfirmacao(telefone, entrada, conversa.contexto);
      break;

    case 'fluxo_ver_agendamentos':
      await processarEscolhaAgendamento(telefone, entrada, conversa.contexto);
      break;

    case 'fluxo_agendamento_acao':
      await processarAcaoAgendamento(telefone, entrada, conversa.contexto);
      break;

    case 'fluxo_cancelamento_confirmando':
      await processarConfirmacaoCancelamento(telefone, entrada, conversa.contexto);
      break;

    case 'fluxo_remarcar_escolhendo_horario':
      await processarEscolhaHorarioRemarcar(telefone, entrada, conversa.contexto);
      break;

    case 'fluxo_remarcar_confirmando':
      await processarConfirmacaoRemarcacao(telefone, entrada, conversa.contexto);
      break;

    // 'aguardando_atendente' não tem case aqui de propósito: enquanto existe um
    // atendimento aberto pro telefone, processarMensagem já retorna lá no topo,
    // antes de chegar nesse switch. Se cair aqui mesmo assim (estado desalinhado
    // do atendimento, por algum motivo), o default abaixo reseta pro menu.

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
      case 'menu_atendente': {
        const cliente = await buscarOuCriarClientePorTelefone(telefone);
        await iniciarAtendimento(cliente.id);
        await atualizarEstado(telefone, 'aguardando_atendente');
        try {
          await enviarMensagemTexto(
            telefone,
            'Ok, um atendente vai falar com você em breve. Pode mandar sua mensagem por aqui.',
          );
        } catch (error) {
          logger.error(
            { error, telefone },
            'Falha ao enviar confirmação de atendimento ao cliente',
          );
        }
        return;
      }
    }
  }

  await enviarMensagemTexto(telefone, 'Por favor, escolha uma das opções abaixo:');
  await enviarMenu(telefone);
}

// --- Fluxo: agendar horário ---

async function listarServicosAtivos(): Promise<
  { id: number; nome: string; duracaoMinutos: number }[]
> {
  const { rows } = await pool.query(
    `SELECT id, nome, duracao_minutos FROM servicos WHERE ativo = true ORDER BY nome`,
  );
  return rows.map((r) => ({ id: r.id, nome: r.nome, duracaoMinutos: r.duracao_minutos }));
}

// Horários livres pro serviço, agregando TODOS os profissionais que atendem
// ele (não um profissional fixo) — o cliente escolhe o horário, o sistema
// decide quem atende na hora de confirmar.
async function buscarProximosHorarios(servicoId: number, duracaoMinutos: number): Promise<Date[]> {
  const agora = Date.now();
  const encontrados: Date[] = [];

  for (let i = 0; i < DIAS_BUSCA_HORARIOS && encontrados.length < MAX_HORARIOS_EXIBIDOS; i++) {
    const dia = new Date(agora + i * 24 * 60 * 60 * 1000);
    const horarios = await consultarHorariosDisponiveisParaServico(servicoId, dia, duracaoMinutos);

    for (const horario of horarios) {
      if (encontrados.length >= MAX_HORARIOS_EXIBIDOS) break;
      encontrados.push(horario);
    }
  }

  return encontrados;
}

async function iniciarFluxoAgendamento(telefone: string) {
  const servicos = await listarServicosAtivos();

  if (servicos.length === 0) {
    await enviarMensagemBotoes({
      telefone,
      corpo: 'No momento não há serviços configurados.',
      botoes: BOTAO_ATENDENTE_E_VOLTAR,
    });
    await atualizarEstado(telefone, 'menu');
    return;
  }

  if (servicos.length === 1) {
    await exibirHorariosDisponiveis(telefone, servicos[0].id, servicos[0].duracaoMinutos);
    return;
  }

  // mais de um serviço: cliente escolhe primeiro. Limite de 3 botões por
  // mensagem do WhatsApp — com mais de 3 serviços ativos, só os 3 primeiros
  // (por nome) aparecem aqui; não existe paginação ainda.
  await atualizarEstado(telefone, 'fluxo_agendamento_escolhendo_servico');
  await enviarMensagemBotoes({
    telefone,
    corpo: 'Qual serviço você quer agendar?',
    botoes: servicos.slice(0, MAX_HORARIOS_EXIBIDOS).map((s) => ({
      id: `servico_${s.id}`,
      titulo: s.nome,
    })),
  });
}

async function processarEscolhaServico(telefone: string, entrada: Entrada) {
  if (entrada.tipo !== 'botao' || !entrada.id.startsWith('servico_')) {
    await enviarMensagemTexto(
      telefone,
      'Por favor, escolha um dos serviços enviados, ou toque em Voltar.',
    );
    return;
  }

  const servicoId = Number(entrada.id.slice('servico_'.length));
  const { rows } = await pool.query(
    `SELECT duracao_minutos FROM servicos WHERE id = $1 AND ativo = true`,
    [servicoId],
  );

  if (rows.length === 0) {
    await enviarMensagemTexto(telefone, 'Esse serviço não está mais disponível.');
    await atualizarEstado(telefone, 'menu');
    await enviarMenu(telefone);
    return;
  }

  await exibirHorariosDisponiveis(telefone, servicoId, rows[0].duracao_minutos);
}

async function exibirHorariosDisponiveis(
  telefone: string,
  servicoId: number,
  duracaoMinutos: number,
) {
  const horarios = await buscarProximosHorarios(servicoId, duracaoMinutos);

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
  const servicoId = contexto?.servicoId as number;
  const duracaoMinutos = contexto?.duracaoMinutos as number;

  await atualizarEstado(telefone, 'fluxo_agendamento_confirmando', {
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

// Mesmo dia (horário de Brasília) == sem janela normal de 24h pra cancelar,
// então a confirmação precisa deixar isso bem claro na hora, já que é a
// única chance prática do cliente perceber um erro de data/horário.
function ehHojeBRT(data: Date): boolean {
  const local = paraHorarioLocal(data);
  const agoraLocal = paraHorarioLocal(new Date());
  return (
    local.getUTCFullYear() === agoraLocal.getUTCFullYear() &&
    local.getUTCMonth() === agoraLocal.getUTCMonth() &&
    local.getUTCDate() === agoraLocal.getUTCDate()
  );
}

function mensagemConfirmacaoAgendamento(dataHora: Date): string {
  const base = `Agendamento confirmado para ${formatarDataHora(dataHora)}. ✅`;

  if (ehHojeBRT(dataHora)) {
    return `${base}\n\n⚠️ Esse horário é hoje — confira com atenção se a data e o horário estão certos. Por ser no mesmo dia, não é possível cancelar pelo prazo normal de 24h; qualquer ajuste precisa ser feito falando com um atendente.`;
  }

  return `${base}\n\nLembrando: cancelamentos só podem ser feitos até 24h antes do horário marcado.`;
}

async function processarConfirmacao(
  telefone: string,
  entrada: Entrada,
  contexto: Record<string, unknown> | null,
) {
  const servicoId = contexto?.servicoId as number;
  const duracaoMinutos = contexto?.duracaoMinutos as number;
  const dataHoraIso = contexto?.dataHora as string;

  if (entrada.tipo === 'botao' && entrada.id === 'abortar_agendamento') {
    await exibirHorariosDisponiveis(telefone, servicoId, duracaoMinutos);
    return;
  }

  if (entrada.tipo !== 'botao' || entrada.id !== 'confirmar_agendamento') {
    await enviarMensagemTexto(telefone, 'Por favor, toque em Confirmar ou Escolher outro.');
    return;
  }

  try {
    const dataHora = new Date(dataHoraIso);
    // decide AGORA (não na listagem) qual profissional específico atende —
    // reconfere do zero, porque o tempo passou entre o cliente ver a lista
    // e confirmar, e outro agendamento pode ter ocupado esse horário
    const profissionalId = await obterProfissionalDisponivel(servicoId, dataHora, duracaoMinutos);

    const cliente = await buscarOuCriarClientePorTelefone(telefone);
    await criarAgendamento({
      clienteId: cliente.id,
      profissionalId,
      servicoId,
      dataHora,
    });

    await atualizarEstado(telefone, 'menu');
    await enviarMensagemTexto(telefone, mensagemConfirmacaoAgendamento(dataHora));
    await enviarMenu(telefone);
  } catch (error) {
    if (error instanceof AppError) {
      // horário ocupado por concorrência, ou caiu abaixo da antecedência mínima
      // enquanto o cliente decidia: informa e mostra horários atualizados.
      await enviarMensagemTexto(telefone, error.message);
      await exibirHorariosDisponiveis(telefone, servicoId, duracaoMinutos);
      return;
    }
    throw error;
  }
}

// --- Fluxo: ver agendamentos (escolher um, depois cancelar ou remarcar) ---

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

  // já vem ordenado por data_hora crescente; cobre os mais próximos primeiro
  const selecionaveis = agendamentos.slice(0, MAX_AGENDAMENTOS_LISTADOS);

  const lista = agendamentos
    .map((a) => `• ${formatarDataHora(new Date(a.data_hora))} — ${a.servico_nome}`)
    .join('\n');

  const aviso =
    agendamentos.length > MAX_AGENDAMENTOS_LISTADOS
      ? `\n\nMostrando os ${MAX_AGENDAMENTOS_LISTADOS} mais próximos por aqui. Pra mexer nos outros, fale com um atendente.`
      : '';

  await atualizarEstado(telefone, 'fluxo_ver_agendamentos', {
    agendamentoIds: selecionaveis.map((a) => a.id),
  });

  await enviarMensagemBotoes({
    telefone,
    corpo: `Seus agendamentos:\n${lista}${aviso}\n\nToque em um agendamento abaixo pra ver as opções:`,
    botoes: [
      ...selecionaveis.map((a) => ({
        id: `agendamento_${a.id}`,
        titulo: formatarDataHora(new Date(a.data_hora)),
      })),
      ...BOTAO_VOLTAR,
    ],
  });
}

async function processarEscolhaAgendamento(
  telefone: string,
  entrada: Entrada,
  contexto: Record<string, unknown> | null,
) {
  const agendamentoIds = (contexto?.agendamentoIds as number[]) ?? [];

  if (entrada.tipo !== 'botao' || !entrada.id.startsWith('agendamento_')) {
    await enviarMensagemTexto(
      telefone,
      'Por favor, toque em um dos agendamentos enviados, ou em Voltar.',
    );
    return;
  }

  const agendamentoId = Number(entrada.id.slice('agendamento_'.length));

  if (!agendamentoIds.includes(agendamentoId)) {
    // proteção contra id fora da lista que foi oferecida (payload adulterado ou conversa velha)
    await enviarMensagemTexto(telefone, 'Esse agendamento não está mais disponível por aqui.');
    await atualizarEstado(telefone, 'menu');
    await enviarMenu(telefone);
    return;
  }

  const agendamento = await buscarPorId(agendamentoId);

  await atualizarEstado(telefone, 'fluxo_agendamento_acao', { agendamentoId });
  await enviarMensagemBotoes({
    telefone,
    corpo: `O que você quer fazer com o agendamento de ${formatarDataHora(new Date(agendamento.data_hora))}?`,
    botoes: [
      { id: 'acao_cancelar', titulo: 'Cancelar' },
      { id: 'acao_remarcar', titulo: 'Remarcar' },
      ...BOTAO_VOLTAR,
    ],
  });
}

async function processarAcaoAgendamento(
  telefone: string,
  entrada: Entrada,
  contexto: Record<string, unknown> | null,
) {
  const agendamentoId = contexto?.agendamentoId as number;

  if (entrada.tipo === 'botao' && entrada.id === 'acao_cancelar') {
    const agendamento = await buscarPorId(agendamentoId);
    await abrirConfirmacaoCancelamento(telefone, agendamentoId, new Date(agendamento.data_hora));
    return;
  }

  if (entrada.tipo === 'botao' && entrada.id === 'acao_remarcar') {
    await iniciarFluxoRemarcar(telefone, agendamentoId);
    return;
  }

  await enviarMensagemTexto(telefone, 'Por favor, toque em Cancelar, Remarcar ou Voltar.');
}

async function abrirConfirmacaoCancelamento(
  telefone: string,
  agendamentoId: number,
  dataHora: Date,
) {
  await atualizarEstado(telefone, 'fluxo_cancelamento_confirmando', { agendamentoId });
  await enviarMensagemBotoes({
    telefone,
    corpo: `Confirmar cancelamento do agendamento de ${formatarDataHora(dataHora)}?`,
    botoes: [
      { id: 'confirmar_cancelamento', titulo: 'Confirmar' },
      { id: 'manter_agendamento', titulo: 'Manter agendamento' },
    ],
  });
}

async function processarConfirmacaoCancelamento(
  telefone: string,
  entrada: Entrada,
  contexto: Record<string, unknown> | null,
) {
  const agendamentoId = contexto?.agendamentoId as number;

  if (entrada.tipo === 'botao' && entrada.id === 'manter_agendamento') {
    await iniciarFluxoVerAgendamentos(telefone);
    return;
  }

  if (entrada.tipo !== 'botao' || entrada.id !== 'confirmar_cancelamento') {
    await enviarMensagemTexto(telefone, 'Por favor, toque em Confirmar ou Manter agendamento.');
    return;
  }

  try {
    await cancelarComoCliente(agendamentoId);
    await atualizarEstado(telefone, 'menu');
    await enviarMensagemTexto(telefone, 'Agendamento cancelado. ✅');
    await enviarMenu(telefone);
  } catch (error) {
    if (error instanceof AppError) {
      // ex: regra de 24h não cumprida (pode ter mudado entre a listagem e a confirmação)
      await enviarMensagemTexto(telefone, error.message);
      await atualizarEstado(telefone, 'menu');
      await enviarMenu(telefone);
      return;
    }
    throw error;
  }
}

// --- Fluxo: remarcar (reagendar) agendamento ---
// Mesma lógica multi-profissional do agendamento novo: o cliente escolhe o
// horário sem escolher profissional, e reagendarAgendamento (backend) decide
// quem fica com o agendamento (tenta manter o profissional original, só troca
// se ele não estiver livre no novo horário).

async function iniciarFluxoRemarcar(telefone: string, agendamentoId: number) {
  const agendamento = await buscarPorId(agendamentoId);

  const { rows: servicos } = await pool.query(
    `SELECT duracao_minutos FROM servicos WHERE id = $1`,
    [agendamento.servico_id],
  );
  const duracaoMinutos = servicos[0]?.duracao_minutos;

  if (!duracaoMinutos) {
    await enviarMensagemBotoes({
      telefone,
      corpo: 'Não foi possível remarcar esse agendamento agora.',
      botoes: BOTAO_ATENDENTE_E_VOLTAR,
    });
    await atualizarEstado(telefone, 'menu');
    return;
  }

  await exibirHorariosParaRemarcar(telefone, agendamentoId, agendamento.servico_id, duracaoMinutos);
}

async function exibirHorariosParaRemarcar(
  telefone: string,
  agendamentoId: number,
  servicoId: number,
  duracaoMinutos: number,
) {
  const horarios = await buscarProximosHorarios(servicoId, duracaoMinutos);

  if (horarios.length === 0) {
    await enviarMensagemBotoes({
      telefone,
      corpo: `Não há horários disponíveis nos próximos ${DIAS_BUSCA_HORARIOS} dias pra remarcar.`,
      botoes: BOTAO_ATENDENTE_E_VOLTAR,
    });
    await atualizarEstado(telefone, 'menu');
    return;
  }

  await atualizarEstado(telefone, 'fluxo_remarcar_escolhendo_horario', {
    agendamentoId,
    servicoId,
    duracaoMinutos,
  });

  await enviarMensagemBotoes({
    telefone,
    corpo: 'Escolha o novo horário:',
    botoes: horarios.map((horario) => ({
      id: `remarcar_slot_${horario.toISOString()}`,
      titulo: formatarDataHora(horario),
    })),
  });
}

async function processarEscolhaHorarioRemarcar(
  telefone: string,
  entrada: Entrada,
  contexto: Record<string, unknown> | null,
) {
  if (entrada.tipo !== 'botao' || !entrada.id.startsWith('remarcar_slot_')) {
    await enviarMensagemTexto(
      telefone,
      'Por favor, escolha um dos horários enviados, ou toque em Voltar.',
    );
    return;
  }

  const novaDataHoraIso = entrada.id.slice('remarcar_slot_'.length);
  const agendamentoId = contexto?.agendamentoId as number;
  const servicoId = contexto?.servicoId as number;
  const duracaoMinutos = contexto?.duracaoMinutos as number;

  await atualizarEstado(telefone, 'fluxo_remarcar_confirmando', {
    agendamentoId,
    servicoId,
    duracaoMinutos,
    novaDataHora: novaDataHoraIso,
  });

  await enviarMensagemBotoes({
    telefone,
    corpo: `Remarcar para ${formatarDataHora(new Date(novaDataHoraIso))}?`,
    botoes: [
      { id: 'confirmar_remarcacao', titulo: 'Confirmar' },
      { id: 'abortar_remarcacao', titulo: 'Escolher outro' },
    ],
  });
}

async function processarConfirmacaoRemarcacao(
  telefone: string,
  entrada: Entrada,
  contexto: Record<string, unknown> | null,
) {
  const agendamentoId = contexto?.agendamentoId as number;
  const servicoId = contexto?.servicoId as number;
  const duracaoMinutos = contexto?.duracaoMinutos as number;
  const novaDataHoraIso = contexto?.novaDataHora as string;

  if (entrada.tipo === 'botao' && entrada.id === 'abortar_remarcacao') {
    await exibirHorariosParaRemarcar(telefone, agendamentoId, servicoId, duracaoMinutos);
    return;
  }

  if (entrada.tipo !== 'botao' || entrada.id !== 'confirmar_remarcacao') {
    await enviarMensagemTexto(telefone, 'Por favor, toque em Confirmar ou Escolher outro.');
    return;
  }

  try {
    await reagendarAgendamento(agendamentoId, new Date(novaDataHoraIso));
    await atualizarEstado(telefone, 'menu');
    await enviarMensagemTexto(
      telefone,
      `Agendamento remarcado para ${formatarDataHora(new Date(novaDataHoraIso))}. ✅`,
    );
    await enviarMenu(telefone);
  } catch (error) {
    if (error instanceof AppError) {
      // horário ocupado por concorrência, ou caiu abaixo da antecedência mínima
      await enviarMensagemTexto(telefone, error.message);
      await exibirHorariosParaRemarcar(telefone, agendamentoId, servicoId, duracaoMinutos);
      return;
    }
    throw error;
  }
}

async function processarGatilhoLembrete(
  telefone: string,
  agendamentoId: number,
  acao: 'cancelar' | 'remarcar',
) {
  const { rows } = await pool.query(
    `SELECT a.*, c.telefone AS cliente_telefone
     FROM agendamentos a
     JOIN clientes c ON c.id = a.cliente_id
     WHERE a.id = $1`,
    [agendamentoId],
  );
  const agendamento = rows[0];

  const valido =
    agendamento && agendamento.cliente_telefone === telefone && agendamento.status === 'agendado';

  if (!valido) {
    await enviarMensagemTexto(telefone, 'Esse agendamento não está mais disponível.');
    await atualizarEstado(telefone, 'menu');
    await enviarMenu(telefone);
    return;
  }

  await buscarOuCriarConversa(telefone);

  if (acao === 'cancelar') {
    await abrirConfirmacaoCancelamento(telefone, agendamento.id, new Date(agendamento.data_hora));
  } else {
    await iniciarFluxoRemarcar(telefone, agendamento.id);
  }
}
