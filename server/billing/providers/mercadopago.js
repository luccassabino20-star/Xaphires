// Adaptador do Mercado Pago. Ainda NÃO implementado: existe para fixar a forma da
// integração e para o resto do sistema já poder ser escrito contra ela.
//
// Cada método falha com uma mensagem dizendo o que falta, em vez de devolver um
// valor inventado. Provedor de pagamento que finge sucesso é a pior falha possível:
// liberaria plano pago sem cobrança nenhuma, que é exatamente o problema que esta
// etapa existe para resolver.
//
// O que falta para ligar (etapa 4):
//
//   1. Credencial em MERCADOPAGO_ACCESS_TOKEN, e BILLING_PROVIDER=mercadopago.
//   2. POST /v1/payments para Pix e boleto (`payment_method_id` "pix" / "bolbradesco"),
//      lendo `point_of_interaction.transaction_data.qr_code` para o copia-e-cola.
//   3. POST /preapproval para o cartão recorrente, que é a assinatura de verdade —
//      é ela que dispensa o cliente de agir a cada mês.
//   4. Webhook: o Mercado Pago manda `{ type, data: { id } }` e NÃO manda o estado.
//      Recebido o aviso, tem de consultar GET /v1/payments/{id} para saber o que
//      aconteceu. Confiar no corpo do aviso é como se cria fraude por POST forjado.
//   5. Validar a assinatura do aviso pelo cabeçalho `x-signature` com o segredo do
//      painel, e responder 200 rápido: o Mercado Pago reenvia o que demora.
//
// Vocabulário deles → nosso, para traduzir em traduzirStatus():
//   approved, accredited        -> paid
//   pending, in_process, authorized -> pending
//   rejected                    -> failed
//   cancelled                   -> canceled
//   refunded, charged_back      -> refunded

function naoConfigurado(oQue) {
  const err = new Error(
    `Mercado Pago ainda não está implementado (${oQue}). Rode com BILLING_PROVIDER=fake ou conclua a etapa 4 da cobrança.`
  );
  err.code = "BILLING_PROVIDER_NOT_CONFIGURED";
  return err;
}

// Tradução do vocabulário do provedor para o nosso. Já vale, e é o pedaço que não
// depende de credencial nenhuma para estar certo.
export function traduzirStatus(statusMP) {
  switch (statusMP) {
    case "approved":
    case "accredited":
      return "paid";
    case "pending":
    case "in_process":
    case "in_mediation":
    case "authorized":
      return "pending";
    case "rejected":
      return "failed";
    case "cancelled":
      return "canceled";
    case "refunded":
    case "charged_back":
      return "refunded";
    default:
      return null;
  }
}

export const mercadoPago = {
  nome: "mercadopago",

  async criarCobranca() {
    throw naoConfigurado("criarCobranca");
  },
  async consultarCobranca() {
    throw naoConfigurado("consultarCobranca");
  },
  async criarAssinatura() {
    throw naoConfigurado("criarAssinatura");
  },
  async cancelarAssinatura() {
    throw naoConfigurado("cancelarAssinatura");
  },
  lerWebhook() {
    // null = aviso não reconhecido. Devolver null aqui é seguro: a rota responde
    // 200 e ignora, sem mudar estado de pagamento nenhum.
    return null;
  },
};
