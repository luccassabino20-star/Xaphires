// Adaptador do Mercado Pago.
//
// Implementa o contrato de billing/gateway.js contra a API real. Ligar é definir
// BILLING_PROVIDER=mercadopago e MERCADOPAGO_ACCESS_TOKEN.
//
// Usa o SDK oficial (`mercadopago`), e não requisições montadas à mão. O SDK carrega
// os tipos da API, então o formato do corpo e os caminhos de leitura da resposta
// deixam de ser suposição — foi assim que se descobriu que a linha do boleto vive em
// transaction_details, e não na raiz como esta implementação supunha antes.
//
// AINDA NÃO FOI EXERCITADO CONTRA A API. Os formatos conferem com os tipos
// instalados, mas nenhuma chamada de rede daqui rodou de verdade. Antes de apontar
// para produção, rode com credencial de TESTE.
//
// Decisões que valem conhecer antes de mexer:
//
// VALOR VAI EM REAIS, NÃO EM CENTAVOS. A API espera transaction_amount decimal
// (349.99). Guardamos centavos inteiros justamente para não fazer conta em float,
// então a conversão acontece só na borda, uma vez, e volta a ser inteiro na
// resposta. Dividir por 100 aqui é seguro porque não há aritmética depois.
//
// IDEMPOTÊNCIA É OBRIGATÓRIA. A varredura roda na leitura do quadro e uma chamada
// pode ser repetida por retry de rede. Sem idempotencyKey, duas requisições iguais
// viram duas cobranças no cartão do cliente.
//
// O WEBHOOK NÃO DIZ O QUE ACONTECEU. O Mercado Pago manda só { type, data: { id } }.
// O estado vem de uma consulta. Confiar no corpo do aviso deixaria qualquer POST
// forjado liberar plano pago.

import crypto from "node:crypto";
import { MercadoPagoConfig, Payment, PreApproval } from "mercadopago";

const TIMEOUT_MS = 15000;

// Criado sob demanda, e não no import: com BILLING_PROVIDER=fake este arquivo é
// carregado do mesmo jeito (o gateway importa os dois provedores), e exigir
// credencial no topo quebraria o desenvolvimento.
let clientes = null;

function api() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    const err = new Error(
      "MERCADOPAGO_ACCESS_TOKEN não definido. Defina a credencial ou rode com BILLING_PROVIDER=fake."
    );
    err.code = "BILLING_PROVIDER_NOT_CONFIGURED";
    throw err;
  }
  if (!clientes || clientes.token !== token) {
    const config = new MercadoPagoConfig({ accessToken: token, options: { timeout: TIMEOUT_MS } });
    clientes = { token, payment: new Payment(config), preApproval: new PreApproval(config) };
  }
  return clientes;
}

// Erro do SDK vira erro nosso, com o código que as rotas sabem tratar.
function comoErroNosso(err) {
  const e = new Error(err?.message || "Falha ao falar com o Mercado Pago");
  e.code = "GATEWAY_ERROR";
  e.status = err?.status || err?.statusCode || null;
  e.detalhe = err?.cause || err?.error || null;
  return e;
}

// Centavos inteiros -> reais decimais, só na borda da API.
function reais(cents) {
  return Number((cents / 100).toFixed(2));
}

// Reais decimais -> centavos inteiros, arredondando. Math.round e não truncamento:
// 349.99 pode voltar do JSON como 349.98999999999995 e truncar perderia um centavo.
export function paraCentavos(valor) {
  return Math.round(Number(valor) * 100);
}

// Vocabulário deles -> o nosso. Ficar aqui, e não espalhado, é o que permite o resto
// do sistema não conhecer "accredited" nem "in_process".
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
      // null e não "pending": status desconhecido não pode virar palpite otimista.
      // Quem recebe decide o que fazer, e o padrão é não mexer no pagamento.
      return null;
  }
}

const METODO_MP = { pix: "pix", boleto: "bolbradesco" };

function exigePagador(payer, metodo) {
  if (!payer?.email) {
    const err = new Error("E-mail do pagador é obrigatório.");
    err.code = "PAYER_EMAIL_REQUIRED";
    throw err;
  }
  // Pix e boleto no Brasil exigem CPF/CNPJ do pagador. Falhar aqui, com código
  // próprio, é melhor do que montar a requisição e receber um 400 genérico do
  // gateway que ninguém consegue interpretar na tela.
  if ((metodo === "pix" || metodo === "boleto") && !payer?.doc) {
    const err = new Error("CPF ou CNPJ do pagador é obrigatório para Pix e boleto.");
    err.code = "PAYER_DOCUMENT_REQUIRED";
    throw err;
  }
}

function identificacao(doc) {
  const numero = String(doc || "").replace(/\D/g, "");
  return { type: numero.length > 11 ? "CNPJ" : "CPF", number: numero };
}

export const mercadoPago = {
  nome: "mercadopago",

  async criarCobranca({ amountCents, method, plan, companyId, card, payer, idempotencyKey }) {
    exigePagador(payer, method);

    const corpo = {
      transaction_amount: reais(amountCents),
      description: `Cantiere - plano ${plan}`,
      // external_reference amarra a cobrança à empresa. É o que permite reconciliar
      // pelo painel do Mercado Pago quando algo não bate.
      external_reference: companyId,
      payer: {
        email: payer.email,
        ...(payer.doc ? { identification: identificacao(payer.doc) } : {}),
      },
    };

    if (method === "card") {
      // O token vem do SDK no navegador. Número de cartão não passa por aqui.
      if (!card?.token) {
        const err = new Error("Token do cartão ausente.");
        err.code = "CARD_TOKEN_REQUIRED";
        throw err;
      }
      corpo.token = card.token;
      corpo.installments = 1;
      if (card.paymentMethodId) corpo.payment_method_id = card.paymentMethodId;
      if (card.issuerId) corpo.issuer_id = card.issuerId;
    } else {
      corpo.payment_method_id = METODO_MP[method];
    }

    // A chave de idempotência precisa ser estável para a MESMA tentativa e diferente
    // entre tentativas distintas. Quem manda é o chamador, que sabe de qual ciclo e
    // de qual tentativa se trata.
    let resposta;
    try {
      resposta = await api().payment.create({
        body: corpo,
        requestOptions: { idempotencyKey: idempotencyKey || crypto.randomUUID() },
      });
    } catch (err) {
      if (err.code === "BILLING_PROVIDER_NOT_CONFIGURED") throw err;
      throw comoErroNosso(err);
    }

    const status = traduzirStatus(resposta?.status);
    const pix = resposta?.point_of_interaction?.transaction_data;
    const detalhes = resposta?.transaction_details;
    return {
      providerChargeId: String(resposta?.id ?? ""),
      status: status || "pending",
      failureReason: resposta?.status_detail || null,
      pixCode: pix?.qr_code || null,
      // A linha digitável mora em transaction_details, não na raiz — e o campo certo
      // é digitable_line, que é o que a pessoa digita no banco. barcode.content é o
      // conteúdo cru do código de barras, e serve de reserva.
      boletoLine: detalhes?.digitable_line || detalhes?.barcode?.content || null,
      checkoutUrl: detalhes?.external_resource_url || pix?.ticket_url || null,
      dueAt: resposta?.date_of_expiration || null,
    };
  },

  async consultarCobranca(providerChargeId) {
    if (!providerChargeId) return { status: null };
    try {
      const r = await api().payment.get({ id: String(providerChargeId) });
      return { status: traduzirStatus(r?.status), failureReason: r?.status_detail || null };
    } catch (err) {
      if (err.code === "BILLING_PROVIDER_NOT_CONFIGURED") throw err;
      throw comoErroNosso(err);
    }
  },

  // Débito recorrente de verdade. É o /preapproval, e não uma cobrança repetida:
  // sem ele o cliente teria de agir todo mês, que é o oposto de assinatura.
  async criarAssinatura({ plan, method, card, payer, amountCents }) {
    if (method !== "card") {
      const err = new Error("Débito automático só existe no cartão.");
      err.code = "METHOD_NOT_RECURRING";
      throw err;
    }
    if (!card?.token) {
      const err = new Error("Token do cartão ausente.");
      err.code = "CARD_TOKEN_REQUIRED";
      throw err;
    }
    exigePagador(payer, method);

    try {
      const r = await api().preApproval.create({
        body: {
          reason: `Cantiere - plano ${plan}`,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: reais(amountCents),
            currency_id: "BRL",
          },
          payer_email: payer.email,
          card_token_id: card.token,
          back_url: process.env.FRONTEND_URL || "http://localhost:5173",
          status: "authorized",
        },
      });
      return { providerSubscriptionId: String(r?.id ?? ""), status: "active" };
    } catch (err) {
      if (err.code === "BILLING_PROVIDER_NOT_CONFIGURED") throw err;
      // Cartão recusado é resposta de negócio, não falha de integração: vira um
      // resultado que o ciclo de vida sabe tratar, com a mensagem do emissor.
      const status = err?.status || err?.statusCode;
      if (status === 400) {
        return { providerSubscriptionId: null, status: "failed", failureReason: err?.message || "CARD_DECLINED" };
      }
      throw comoErroNosso(err);
    }
  },

  async cancelarAssinatura(providerSubscriptionId) {
    if (!providerSubscriptionId) return { status: "canceled" };
    try {
      await api().preApproval.update({ id: String(providerSubscriptionId), body: { status: "cancelled" } });
      return { status: "canceled" };
    } catch (err) {
      if (err.code === "BILLING_PROVIDER_NOT_CONFIGURED") throw err;
      throw comoErroNosso(err);
    }
  },

  // Traduz o aviso. NÃO decide nada sobre o pagamento: devolve o id e um pedido de
  // consulta, porque o corpo do webhook não carrega o estado e não é confiável.
  lerWebhook(req) {
    if (!validarAssinatura(req)) return null;
    const corpo = req.body || {};
    const tipo = corpo.type || corpo.topic;
    if (tipo !== "payment") return null;
    const id = corpo.data?.id || corpo.resource;
    if (!id) return null;
    // consultar: true diz à rota para perguntar o estado antes de aplicar.
    return { providerChargeId: String(id), consultar: true };
  },
};

// Assinatura do aviso, conforme o cabeçalho x-signature do Mercado Pago.
//
// O manifesto é montado a partir do id do recurso, do x-request-id e do ts que vem
// no próprio cabeçalho, e comparado por HMAC-SHA256 com o segredo do painel.
//
// conferir: o formato exato do manifesto é o ponto mais sensível deste arquivo.
// Se a validação recusar avisos legítimos, os pagamentos param de ser confirmados
// pelo webhook — e só a consulta periódica do cliente salvaria. Teste com um aviso
// real de credencial de teste antes de confiar.
export function validarAssinatura(req) {
  const segredo = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  // Sem segredo configurado a validação não pode "passar por padrão": isso
  // transformaria qualquer POST numa confirmação de pagamento.
  if (!segredo) return false;

  const cabecalho = req.get("x-signature") || "";
  const partes = Object.fromEntries(
    cabecalho.split(",").map((p) => {
      const [k, ...resto] = p.split("=");
      return [k.trim(), resto.join("=").trim()];
    })
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  const id = req.body?.data?.id || req.query?.["data.id"] || "";
  const requestId = req.get("x-request-id") || "";
  const manifesto = `id:${id};request-id:${requestId};ts:${ts};`;
  const esperado = crypto.createHmac("sha256", segredo).update(manifesto).digest("hex");

  // timingSafeEqual exige buffers do mesmo tamanho, então confere o tamanho antes.
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
