import { logger } from '@/infra/logger';
import { pool } from '@/infra/database';
import { enviarMensagemTemplateComBotoes } from '@/infra/whatsapp';
import { formatarDataHora, inicioDoDiaBRT, fimDoDiaBRT } from '@/infra/data';

// Nome e estrutura precisam bater exatamente com um template aprovado no Meta Business
// Manager (corpo com 2 variáveis: data/hora e nome do serviço; 2 botões quick_reply).
// Enquanto esse template não existir aprovado, essa rota vai falhar no envio real (a
// query e o resto da lógica funcionam normalmente, só o enviarMensagemTemplateComBotoes
// vai retornar erro da API do Meta).
const NOME_TEMPLATE_LEMBRETE = 'lembrete_agendamento_24h';
const IDIOMA_TEMPLATE = 'pt_BR';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Forbidden', { status: 401 });
  }

  const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);
  // limites do dia em horário de Brasília, não do servidor (que pode estar em UTC)
  const inicioDia = inicioDoDiaBRT(amanha);
  const fimDia = fimDoDiaBRT(amanha);

  const { rows: agendamentos } = await pool.query(
    `SELECT a.id, a.data_hora, c.telefone, s.nome AS servico_nome
     FROM agendamentos a
     JOIN clientes c ON c.id = a.cliente_id
     JOIN servicos s ON s.id = a.servico_id
     WHERE a.status = 'agendado'
       AND a.lembrete_enviado = false
       AND a.data_hora BETWEEN $1 AND $2`,
    [inicioDia, fimDia],
  );

  let enviados = 0;
  let falhas = 0;

  for (const agendamento of agendamentos) {
    try {
      await enviarMensagemTemplateComBotoes({
        telefone: agendamento.telefone,
        nomeTemplate: NOME_TEMPLATE_LEMBRETE,
        idiomaCodigo: IDIOMA_TEMPLATE,
        parametrosCorpo: [
          formatarDataHora(new Date(agendamento.data_hora)),
          agendamento.servico_nome,
        ],
        payloadsBotoes: [
          `lembrete_remarcar_${agendamento.id}`,
          `lembrete_cancelar_${agendamento.id}`,
        ],
      });

      await pool.query(`UPDATE agendamentos SET lembrete_enviado = true WHERE id = $1`, [
        agendamento.id,
      ]);
      enviados++;
    } catch (error) {
      // lembrete_enviado continua false de propósito, pra permitir reenvio manual pelo painel
      logger.error({ agendamentoId: agendamento.id, error }, 'Falha ao enviar lembrete de 24h');
      falhas++;
    }
  }

  logger.info(
    { total: agendamentos.length, enviados, falhas },
    'Cron de lembretes de 24h concluído',
  );

  return Response.json({ ok: true, total: agendamentos.length, enviados, falhas });
}
