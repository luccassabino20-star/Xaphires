// Provedor simulado de Cobranças - mesmo espírito de
// server/billing/providers/fake.js: Pix e boleto nascem PENDENTES (confirmar é
// um passo à parte, ver rota .../dev-confirmar), e cartão com final 0002/0003/
// 0004 é recusado. É o que permite emitir, confirmar e cancelar sem credencial
// nenhuma - e é o provedor padrão de toda empresa até ela configurar a própria
// conta em Mercado Pago ou Banco Inter (ver financeiro_gateway_config).
import crypto from "node:crypto";

function novoId() {
  return "fake_" + crypto.randomUUID();
}

export const fake = {
  nome: "fake",
  metodosSuportados: () => ["pix", "boleto", "card"],

  // cardNumber só existe neste provedor - o formulário de cartão do cliente só
  // mostra o campo de número quando o gateway configurado é o fake (mesma regra
  // do simulated:true em server/billing/): nenhum provedor real recebe número
  // de cartão do nosso servidor.
  async criarCobranca({ metodo, cardNumber }) {
    const providerChargeId = novoId();
    if (metodo === "pix") {
      return {
        providerChargeId,
        status: "pending",
        pixPayload: `00020126580014BR.GOV.BCB.PIX0136${providerChargeId}5204000053039865802BR6009SIMULADO6304FAKE`,
        pixQrcodeB64: null,
      };
    }
    if (metodo === "boleto") {
      const linha = String(Date.now()).padStart(47, "0");
      return {
        providerChargeId,
        status: "pending",
        boletoLine: `${linha.slice(0, 5)}.${linha.slice(5, 10)} ${linha.slice(10, 15)}.${linha.slice(15, 21)} ${linha.slice(21, 26)}.${linha.slice(26, 32)} 1 ${linha.slice(32)}`,
        boletoPdfUrl: null,
      };
    }
    // card: recusa terminações reservadas para teste, aprova o resto na hora
    // (cartão não fica pendente igual Pix/boleto - o gateway responde na hora).
    const final = String(cardNumber || "").slice(-4);
    if (["0002", "0003", "0004"].includes(final)) {
      return { providerChargeId, status: "failed" };
    }
    return { providerChargeId, status: "paid" };
  },

  async consultarCobranca() {
    return { status: null };
  },

  async cancelarCobranca() {
    return { status: "canceled" };
  },

  // Sem conta de verdade - a KPI de saldo cai no aproximado por soma local (ver
  // cobrancaRepo.kpis).
  async consultarSaldo() {
    return { saldoCents: null };
  },

  // Sem webhook de verdade: confirmar em desenvolvimento é a rota
  // /dev-confirmar, não um aviso recebido - por isso sempre null aqui.
  lerWebhook() {
    return null;
  },
};
