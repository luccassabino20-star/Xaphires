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
//   consulta. O Mercado Pago manda só o id e obriga a consultar — é o desenho certo,
//   porque um POST forjado com {"status":"paid"} não pode liberar plano.

import { Router } from "express";
import { gateway } from "../billing/gateway.js";
import * as store from "../billing/store.js";
import * as ciclo from "../billing/lifecycle.js";

const router = Router();

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
  if (!aviso?.providerChargeId || !aviso?.status) {
    return res.status(200).json({ received: true, applied: false });
  }

  const pagamento = store.getPaymentByProviderCharge(aviso.providerChargeId);
  if (!pagamento) {
    return res.status(200).json({ received: true, applied: false });
  }

  try {
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
