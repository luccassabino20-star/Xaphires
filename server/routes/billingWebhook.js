// Aviso de pagamento vindo do gateway.
//
// Esta rota é montada ANTES do verifyOrigin de propósito. Gateway não é navegador:
// manda POST sem cabeçalho Origin nem Referer, e a defesa de CSRF do resto da API
// devolveria 403 em todo aviso — os pagamentos seriam confirmados no gateway e nunca
// aqui. Quem autentica aqui é a assinatura do provedor, não o cookie de sessão.
//
// Também não passa por requireAuth: não há usuário logado do outro lado.
//
// Duas regras de sobrevivência de webhook:
//
//   RESPONDER 200 SEMPRE que o aviso foi entendido, mesmo que nada mude. Gateway que
//   recebe erro reenvia, e reenvio em cima de um erro permanente vira tempestade.
//
//   NUNCA CONFIAR NO CORPO para decidir que algo foi pago, quando o provedor oferece
//   consulta. O Asaas manda o estado dentro do aviso, mas mesmo assim pedimos
//   consulta antes de aplicar — é o desenho certo, porque um POST forjado com
//   {"status":"paid"} não pode liberar plano.
//
// Nem toda cobrança que chega aqui já tem uma linha local esperando por ela: um
// checkout hospedado (cartão) e uma renovação de assinatura com débito automático
// nascem do lado do gateway, sem passar por emitirCobranca antes. acharOuCriarPagamento
// cobre os dois casos — ver o comentário dela.

import { Router } from "express";
import crypto from "node:crypto";
import { gateway } from "../billing/gateway.js";
import * as store from "../billing/store.js";
import * as ciclo from "../billing/lifecycle.js";
import { priceCentsOf, addOneMonth } from "../plans.js";

const router = Router();

function nowIso() {
  return new Date().toISOString();
}

// Acha a linha local de duas formas que não são "achar pelo id de cobrança",
// para os dois casos em que esse id ainda não existia quando a linha nasceu:
//
//   1. externalReference: a cobrança veio de um checkout hospedado (cartão, no
//      Asaas). O pagamento local nasceu com provider_charge_id nulo, guardando
//      o PRÓPRIO id como o que foi mandado de externalReference - agora que o
//      aviso trouxe o id real de cobrança, só falta preencher.
//
//   2. providerSubscriptionId: a cobrança é uma renovação de cartão que o
//      próprio gateway disparou sozinho (débito automático de verdade), sem
//      passar por emitirCobranca - não existe linha nenhuma ainda. Cria-se aqui,
//      na hora, casando pela assinatura que o gateway relacionou no aviso.
//      Sem isso, cada renovação a partir da segunda ficaria sem registro no
//      extrato, e a empresa não teria como saber que foi cobrada.
function acharOuCriarPagamento(aviso) {
  let pagamento = store.getPaymentByProviderCharge(aviso.providerChargeId);
  if (pagamento) return pagamento;

  if (aviso.externalReference) {
    const porReferencia = store.getPayment(aviso.externalReference);
    if (porReferencia && porReferencia.provider_charge_id == null) {
      store.setPaymentStatus(porReferencia.id, porReferencia.status, { providerChargeId: aviso.providerChargeId });
      pagamento = store.getPayment(porReferencia.id);
      // Primeira confirmação de uma assinatura nascida de checkout: só agora se
      // sabe o id real dela no gateway - criarAssinatura() não tinha como saber,
      // porque a assinatura só passa a existir quando a pessoa termina de pagar
      // na página hospedada.
      if (pagamento?.subscription_id && aviso.providerSubscriptionId) {
        const assinaturaLocal = store.getSubscription(pagamento.subscription_id);
        if (assinaturaLocal && !assinaturaLocal.provider_subscription_id) {
          store.updateSubscription(assinaturaLocal.id, { providerSubscriptionId: aviso.providerSubscriptionId });
        }
      }
      return pagamento;
    }
  }

  if (aviso.providerSubscriptionId) {
    const assinatura = store.getSubscriptionByProviderSubscriptionId(aviso.providerSubscriptionId);
    if (assinatura) {
      const centavos = priceCentsOf(assinatura.plan);
      if (centavos === null) return null; // plano sob consulta não passa por cobrança automática
      const inicio = nowIso();
      return store.createPayment({
        id: crypto.randomUUID(),
        companyId: assinatura.company_id,
        subscriptionId: assinatura.id,
        plan: assinatura.plan,
        amountCents: centavos,
        method: assinatura.method,
        provider: gateway.nome,
        providerChargeId: aviso.providerChargeId,
        periodStart: inicio,
        periodEnd: addOneMonth(inicio),
        attempt: 1,
        status: "pending",
      });
    }
  }

  return null;
}

router.post("/", async (req, res) => {
  let aviso = null;
  try {
    aviso = gateway.lerWebhook(req);
  } catch (err) {
    console.error("[billing] erro ao ler webhook:", err.message);
  }

  // Não reconhecido ou assinatura inválida: 200 e silêncio. Devolver 401 ensinaria
  // um atacante a distinguir aviso rejeitado de aviso aceito, e faria o gateway
  // legítimo reenviar sem parar quando o formato mudar.
  if (!aviso?.providerChargeId) {
    return res.status(200).json({ received: true, applied: false });
  }

  const pagamento = acharOuCriarPagamento(aviso);
  if (!pagamento) {
    return res.status(200).json({ received: true, applied: false });
  }

  try {
    // lerWebhook() sempre pede consulta, mesmo o Asaas mandando o estado no
    // corpo do aviso. É o desenho certo: um POST forjado não pode liberar plano
    // pago, porque o que decide é a resposta autenticada do gateway, não o
    // corpo recebido — o token no cabeçalho prova que o aviso é do Asaas, não
    // que o conteúdo dele deva ser aplicado direto.
    if (aviso.consultar) {
      await ciclo.conferirPagamento(pagamento.id);
      return res.status(200).json({ received: true, applied: true });
    }

    if (!aviso.status) {
      return res.status(200).json({ received: true, applied: false });
    }
    if (aviso.status === "paid") {
      ciclo.confirmarPagamento(pagamento.id);
    } else if (aviso.status === "failed") {
      ciclo.registrarFalha(pagamento.id, aviso.failureReason);
    } else if (aviso.status === "refunded" || aviso.status === "canceled") {
      store.setPaymentStatus(pagamento.id, aviso.status, { failureReason: aviso.failureReason });
    }
  } catch (err) {
    // Erro nosso ao aplicar: 500 é o certo aqui, porque aí o reenvio do gateway é
    // exatamente o que queremos. É o único caso que justifica não responder 200.
    console.error("[billing] falha ao aplicar webhook:", err);
    return res.status(500).json({ received: true, applied: false });
  }

  res.status(200).json({ received: true, applied: true });
});

export { router };
