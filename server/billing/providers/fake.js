// Provedor simulado. Cobra nada e permite exercitar o ciclo inteiro de assinatura
// — emissão, confirmação, falha, renovação, cancelamento — sem credencial, sem
// rede e sem mover dinheiro.
//
// Não é um mock de teste descartável: é o provedor padrão enquanto a integração
// real não entra, e é o que roda em desenvolvimento depois disso. Por isso imita o
// comportamento que importa do mundo real, e não o caminho felizmente perfeito:
//
//   - Pix e boleto nascem PENDENTES, como na vida real. Quem confirma é o webhook
//     (ou a consulta), nunca a emissão.
//   - Cartão responde na hora, e responde ERRO quando pedido. Cartão recusado é o
//     caso mais comum de assinatura no mundo real, e o sistema precisa saber lidar
//     antes de existir cliente de verdade.
//
// O controle de qual resposta dar está no número do cartão de teste, imitando a
// convenção que os gateways usam. Nada de variável global de "próximo resultado",
// que atrapalha teste paralelo.

import crypto from "node:crypto";

// Terminações de cartão que forçam um resultado. Espelha a ideia dos cartões de
// teste do Mercado Pago e do Stripe.
const CARTOES = {
  "0002": { status: "failed", reason: "CARD_DECLINED" },
  "0003": { status: "failed", reason: "INSUFFICIENT_FUNDS" },
  "0004": { status: "failed", reason: "EXPIRED_CARD" },
};

function resultadoDoCartao(numero) {
  const fim = String(numero || "").slice(-4);
  return CARTOES[fim] || { status: "paid" };
}

function id(prefixo) {
  return `${prefixo}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function emDias(dias) {
  return new Date(Date.now() + dias * 86400000).toISOString();
}

export const fake = {
  nome: "fake",
  // Sem motor de renovação próprio: cartão só cobra de novo quando emitirCobranca()
  // chama criarCobranca() de novo, do mesmo jeito que Pix e boleto - é o que deixa
  // renovação e cancelamento exercitáveis em desenvolvimento, pela varredura normal.
  renovaCartaoSozinho: false,

  async criarCobranca({ amountCents, method, plan, companyId, card }) {
    const chargeId = id("chg");

    if (method === "card") {
      const r = resultadoDoCartao(card?.number);
      return {
        providerChargeId: chargeId,
        status: r.status,
        failureReason: r.reason || null,
        // Cartão resolve na hora: não há nada para o cliente abrir ou copiar.
        dueAt: null,
      };
    }

    if (method === "pix") {
      return {
        providerChargeId: chargeId,
        status: "pending",
        // Copia-e-cola de mentira, mas com a cara de um payload Pix, para a tela
        // poder ser construída contra algo realista.
        pixCode: `00020126SIMULADO${chargeId.toUpperCase()}5204000053039865802BR6009SAO PAULO62070503***6304`,
        // Pix expira rápido: 24h é o costume para cobrança de assinatura.
        dueAt: emDias(1),
      };
    }

    // boleto
    return {
      providerChargeId: chargeId,
      status: "pending",
      boletoLine: `34191.79001 01043.510047 91020.150008 ${Math.floor(Math.random() * 9) + 1} ${String(amountCents).padStart(14, "0")}`,
      checkoutUrl: `http://localhost:4000/api/billing/simulado/${chargeId}/boleto`,
      // Boleto compensa em dias, então o prazo é mais longo.
      dueAt: emDias(3),
    };
  },

  // Sem estado persistido aqui: quem guarda o que aconteceu é a nossa tabela
  // payments. O simulado só sabe responder o que a cobrança seria hoje, e para Pix
  // e boleto isso é "continua pendente até alguém confirmar".
  async consultarCobranca() {
    return { status: "pending" };
  },

  async criarAssinatura({ plan, method, card }) {
    if (method !== "card") {
      throw new Error("Assinatura com débito automático só existe no cartão");
    }
    const r = resultadoDoCartao(card?.number);
    if (r.status === "failed") {
      return { providerSubscriptionId: null, status: "failed", failureReason: r.reason };
    }
    return { providerSubscriptionId: id("sub"), status: "active" };
  },

  async cancelarAssinatura() {
    return { status: "canceled" };
  },

  // O simulado aceita um aviso "assinado" com o segredo local, para dar para
  // exercitar o caminho do webhook de ponta a ponta em desenvolvimento.
  lerWebhook(req) {
    const corpo = req.body || {};
    if (!corpo.providerChargeId || !corpo.status) return null;
    const esperado = process.env.BILLING_WEBHOOK_SECRET || "simulado";
    if ((req.get("x-billing-signature") || "") !== esperado) return null;
    return {
      providerChargeId: corpo.providerChargeId,
      status: corpo.status,
      failureReason: corpo.failureReason || null,
    };
  },
};
