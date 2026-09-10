// Régua de cobrança AUTOMÁTICA por WhatsApp, uma vez ao dia às 09:00.
//
// Único cron de verdade no projeto - todo o resto roda "na leitura"
// (varrerCobranca/runAutoArchive/runRecurrences, ver server/billing/lifecycle.js
// e o comentário de arquitetura em CLAUDE.md). Aqui não dá pra ser preguiçoso:
// o disparo tem que sair de manhã mesmo que ninguém abra o Xaphires naquele
// dia - é o requisito, não um descuido.
//
// Idempotente por ESTÁGIO, não por dia: cada financeiro_cobrancas guarda
// lembrete_estagio/lembrete_em (ver cobrancaSchema.js) - rodar a varredura de
// novo no mesmo dia (reinício do servidor, por exemplo) não manda a mesma
// mensagem duas vezes, porque o estágio já registrado é pulado.
import cron from "node-cron";
import { runWithCompany } from "../context.js";
import { listarEmpresas } from "../admin/store.js";
import { listCobrancas, getReguaConfig, registrarLembreteEnviado } from "../modules/financeiro/cobrancaRepo.js";
import { estagio, montarMensagem } from "../modules/financeiro/cobrancaEngine.js";
import { isReady, sendMessage } from "../services/whatsappService.js";
import { hojeCivil } from "../modules/financeiro/repo.js";

function diasEmAtraso(due, hoje) {
  const [y1, m1, d1] = due.split("-").map(Number);
  const [y2, m2, d2] = hoje.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// O pedido original fixa "3 dias pós-vencimento" como UM gatilho, não "todo
// dia que está atrasado" (isso viraria spam) - dispara uma vez, exatamente no
// terceiro dia de atraso, e nunca mais para aquela cobrança.
const DIAS_POS_VENCIMENTO = 3;

async function processarEmpresa(companyId) {
  if (!isReady(companyId)) {
    console.log(`[billing-cron] WhatsApp não conectado na empresa ${companyId} - pulando`);
    return;
  }
  await runWithCompany(companyId, async () => {
    const regua = getReguaConfig();
    const hoje = hojeCivil();
    const pendentes = listCobrancas({ status: "pending" });
    for (const c of pendentes) {
      const est = estagio(c, { hoje, diasAntes: regua.dias_antes_vencimento });
      let estagioParaEnviar = null;
      if (est === "pre_vencimento" && c.lembrete_estagio !== "pre_vencimento") estagioParaEnviar = "pre_vencimento";
      else if (est === "vencimento" && c.lembrete_estagio !== "vencimento") estagioParaEnviar = "vencimento";
      else if (est === "atrasado" && diasEmAtraso(c.due, hoje) === DIAS_POS_VENCIMENTO && c.lembrete_estagio !== "atrasado") {
        estagioParaEnviar = "atrasado";
      }
      if (!estagioParaEnviar || !c.contato_telefone) continue;

      const link = c.checkout_url || c.boleto_pdf_url || null;
      const mensagem = montarMensagem(c, estagioParaEnviar, regua, { link });
      try {
        await sendMessage(companyId, c.contato_telefone, mensagem);
        registrarLembreteEnviado(c.id, estagioParaEnviar);
        console.log(`[billing-cron] lembrete "${estagioParaEnviar}" enviado - empresa ${companyId}, cobrança ${c.id}`);
      } catch (err) {
        console.error(`[billing-cron] falha ao enviar lembrete - empresa ${companyId}, cobrança ${c.id}:`, err.message);
      }
    }
  });
}

export function iniciarBillingCron() {
  cron.schedule("0 9 * * *", async () => {
    console.log("[billing-cron] iniciando varredura diária da régua de cobrança...");
    const empresas = listarEmpresas();
    for (const empresa of empresas) {
      try {
        await processarEmpresa(empresa.id);
      } catch (err) {
        console.error(`[billing-cron] falha ao processar empresa ${empresa.id}:`, err);
      }
    }
    console.log("[billing-cron] varredura concluída.");
  });
  console.log("[billing-cron] agendado para 09:00 todos os dias.");
}
