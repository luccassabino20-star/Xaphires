// Adaptador do Asaas.
//
// Implementa o contrato de billing/gateway.js contra a API real. Ligar é definir
// BILLING_PROVIDER=asaas, ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN.
//
// AINDA NÃO FOI EXERCITADO CONTRA A API — mesmo aviso que o adaptador do Mercado
// Pago carregava. Os formatos conferem com a documentação pública, mas nenhuma
// chamada de rede daqui rodou de verdade ainda. Rode
// `node server/billing/verificarCredencial.js` com a credencial de TESTE antes de
// apontar para produção — é o que troca "código plausível" por "código provado".
//
// Decisões que valem conhecer antes de mexer:
//
// CARTÃO NÃO TOKENIZA NO NAVEGADOR. Diferente do Mercado Pago (Secure Fields, que
// tokeniza dentro de um iframe deles, sem tocar nosso servidor), a tokenização de
// cartão do Asaas exige a chave secreta e só pode ser chamada do backend — ver
// docs.asaas.com/reference/tokenizacao-de-cartao-de-credito. Fazer isso aqui
// significaria o número do cartão passar pelo nosso servidor, subindo o escopo de
// conformidade PCI de SAQ A para SAQ A-EP. Por isso o cartão usa o CHECKOUT
// HOSPEDADO do Asaas (asaas.com/checkoutSession) em vez de um formulário embutido:
// a pessoa sai do app por alguns segundos, digita o cartão numa página que é do
// próprio Asaas, e volta. Nosso servidor nunca vê o número.
//
// A ASSINATURA DE CARTÃO NASCE NO CHECKOUT, NÃO EM criarAssinatura(). O checkout
// hospedado, com chargeTypes: ["RECURRENT"], cria a assinatura E a primeira
// cobrança de uma vez só, do lado do Asaas, quando a pessoa termina de pagar —
// que acontece bem depois da resposta desta função. Por isso criarAssinatura()
// aqui é só um placeholder (devolve status "active" sem id nenhum), e quem de
// fato cria o checkout é criarCobranca() com method "card", chamada logo em
// seguida por emitirCobranca() (ver lifecycle.js). O id real da assinatura no
// Asaas (e da primeira cobrança) só chegam depois, pelo webhook — ver o
// tratamento de externalReference/providerSubscriptionId em routes/billingWebhook.js.
//
// RENOVAÇÃO DE CARTÃO NÃO PASSA POR NÓS. Uma vez criada, a assinatura no Asaas
// cobra o cartão sozinha a cada ciclo — é justamente o que o checkout hospedado
// compra. lifecycle.js sabe disso e não agenda um next_charge_at para assinaturas
// de cartão (ver o comentário em confirmarPagamento). O que chega de volta é só o
// webhook de cada cobrança nova, que routes/billingWebhook.js cria no nosso banco
// na hora, casando pelo id da assinatura — sem isso, a segunda cobrança em diante
// ficaria sem registro nenhum aqui, com a empresa achando que não foi cobrada.
//
// O WEBHOOK AUTENTICA POR TOKEN FIXO, NÃO POR ASSINATURA HMAC. O Asaas manda o
// token configurado no cabeçalho asaas-access-token, comparado por igualdade
// (constant-time). Mesmo assim o estado não vem confiável do corpo por hábito do
// projeto: pedimos consulta (consultar: true) antes de aplicar, do mesmo jeito
// que o Mercado Pago.

import crypto from "node:crypto";

const TIMEOUT_MS = 15000;

function baseUrl() {
  const ambiente = (process.env.ASAAS_ENV || "sandbox").toLowerCase();
  return ambiente === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

function chave() {
  const k = process.env.ASAAS_API_KEY;
  if (!k) {
    const err = new Error("ASAAS_API_KEY não definido. Defina a credencial ou rode com BILLING_PROVIDER=fake.");
    err.code = "BILLING_PROVIDER_NOT_CONFIGURED";
    throw err;
  }
  return k;
}

// Erro de rede/HTTP vira erro nosso, com o código que as rotas sabem tratar.
function comoErroNosso(err) {
  const e = new Error(err?.message || "Falha ao falar com o Asaas");
  e.code = "GATEWAY_ERROR";
  e.status = err?.status || null;
  e.detalhe = err?.detalhe || null;
  return e;
}

async function chamar(caminho, { method = "GET", body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(baseUrl() + caminho, {
      method,
      headers: {
        "Content-Type": "application/json",
        access_token: chave(),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.code === "BILLING_PROVIDER_NOT_CONFIGURED") throw err;
    throw comoErroNosso({ message: "Não foi possível falar com o Asaas (rede ou tempo esgotado)." });
  } finally {
    clearTimeout(timer);
  }
  let dados = null;
  try {
    dados = await res.json();
  } catch {
    /* corpo vazio, ex. em algumas respostas 204 */
  }
  if (!res.ok) {
    // O Asaas devolve { errors: [{ description }] } nos erros de validação.
    const descricao = dados?.errors?.[0]?.description || `Erro HTTP ${res.status}`;
    throw comoErroNosso({ message: descricao, status: res.status, detalhe: dados });
  }
  return dados;
}

// Reais decimais -> a API do Asaas também espera valor decimal, igual ao Mercado
// Pago. Guardamos centavos inteiros; a conversão fica só na borda.
function reais(cents) {
  return Number((cents / 100).toFixed(2));
}

function dataISO(diasAPartirDeHoje = 0) {
  const d = new Date();
  d.setDate(d.getDate() + diasAPartirDeHoje);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Vocabulário deles -> o nosso, no mesmo espírito do traduzirStatus do Mercado
// Pago: fica só aqui, para o resto do sistema não conhecer "RECEIVED_IN_CASH".
export function traduzirStatus(statusAsaas) {
  switch (statusAsaas) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "paid";
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
      // Vencido continua pendente para nós, não vira uma terceira categoria: o
      // atraso é informação do prazo (due_at), não do status. Mesma regra do
      // pendingExpired() em billing/store.js, que expira pelo NOSSO prazo.
    case "OVERDUE":
      return "pending";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return "refunded";
    case "DELETED":
      return "canceled";
    default:
      // Estado novo do lado deles não vira palpite: quem recebe decide o que
      // fazer, e o padrão é não mexer no pagamento.
      return null;
  }
}

function exigePagador(payer) {
  if (!payer?.email) {
    const err = new Error("E-mail do pagador é obrigatório.");
    err.code = "PAYER_EMAIL_REQUIRED";
    throw err;
  }
}

function exigeDocumento(payer) {
  exigePagador(payer);
  if (!payer?.doc) {
    const err = new Error("CPF ou CNPJ do pagador é obrigatório para Pix e boleto.");
    err.code = "PAYER_DOCUMENT_REQUIRED";
    throw err;
  }
}

// Acha o cliente no Asaas pelo documento, ou cria. Sem tabela própria para
// mapear payer -> cliente Asaas: o volume de cobrança é baixo (uma por empresa
// por mês), então uma consulta a mais por ciclo não pesa, e evita coluna nova só
// para isto.
async function garantirCliente(payer) {
  exigeDocumento(payer);
  const doc = String(payer.doc).replace(/\D/g, "");
  const existentes = await chamar(`/customers?cpfCnpj=${encodeURIComponent(doc)}`);
  const encontrado = existentes?.data?.[0];
  if (encontrado) return encontrado;
  return chamar("/customers", {
    method: "POST",
    body: { name: payer.name || payer.email, email: payer.email, cpfCnpj: doc },
  });
}

function urlFrontend() {
  return process.env.FRONTEND_URL || "http://localhost:5173";
}

// Cartão: cria o checkout hospedado, com chargeTypes RECURRENT + subscription -
// é o que faz o Asaas montar a assinatura E a primeira cobrança juntas, do lado
// dele, quando a pessoa terminar de pagar. externalReference recebe o id do
// pagamento local (gerado antes por lifecycle.js/emitirCobranca): é a única forma
// de casar o webhook, que chega bem depois, com a linha que já existe aqui —
// ver o comentário grande no topo do arquivo.
async function criarCheckoutAssinatura({ amountCents, plan, paymentId }) {
  const corpo = {
    billingTypes: ["CREDIT_CARD"],
    chargeTypes: ["RECURRENT"],
    minutesToExpire: 60,
    callback: {
      successUrl: `${urlFrontend()}/?billing=return`,
      cancelUrl: `${urlFrontend()}/?billing=return`,
      expiredUrl: `${urlFrontend()}/?billing=return`,
    },
    items: [{ name: `Cantiere - plano ${plan}`, quantity: 1, value: reais(amountCents) }],
    // SEM customerData de propósito: testado contra a API de sandbox, mandar
    // QUALQUER campo aqui (mesmo só e-mail) faz o Asaas exigir o conjunto
    // inteiro de uma vez - nome, cpfCnpj, telefone, endereço, número, CEP,
    // estado. Não coletamos nada disso hoje (só e-mail e documento, nem
    // endereço existe no cadastro). Omitir o campo inteiro deixa a própria
    // página hospedada pedir isso à pessoa, que é o que ela já faz sozinha
    // quando o campo não vem preenchido.
    subscription: { cycle: "MONTHLY", nextDueDate: dataISO(1) },
    externalReference: paymentId,
  };
  const resposta = await chamar("/checkouts", { method: "POST", body: corpo });
  return {
    providerChargeId: null, // só existe depois que a pessoa terminar de pagar - ver o topo do arquivo.
    status: "pending",
    checkoutUrl: resposta?.link || null,
  };
}

export const asaas = {
  nome: "asaas",
  // A assinatura de cartão nasce no checkout hospedado (chargeTypes: RECURRENT) e
  // o Asaas cobra o cartão sozinho a cada ciclo - ver gateway.js/metodoRenovaSozinho
  // e o comentário grande no topo deste arquivo.
  renovaCartaoSozinho: true,

  async criarCobranca({ amountCents, method, plan, payer, paymentId }) {
    if (method === "card") return criarCheckoutAssinatura({ amountCents, plan, paymentId });

    exigeDocumento(payer);
    const cliente = await garantirCliente(payer);
    const resposta = await chamar("/payments", {
      method: "POST",
      body: {
        customer: cliente.id,
        billingType: method === "pix" ? "PIX" : "BOLETO",
        value: reais(amountCents),
        dueDate: dataISO(method === "pix" ? 1 : 3),
        description: `Cantiere - plano ${plan}`,
        externalReference: paymentId,
      },
    });

    let pixCode = null;
    if (method === "pix") {
      try {
        const qr = await chamar(`/payments/${resposta.id}/pixQrCode`);
        pixCode = qr?.payload || null;
      } catch (err) {
        // QR falhar não pode derrubar a cobrança que já foi criada - ela existe,
        // só o copia-e-cola que não veio; a pessoa ainda consegue pagar pela
        // invoiceUrl.
        console.error("[billing] falha ao buscar QR code do Pix:", err.message);
      }
    }

    let boletoLine = null;
    if (method === "boleto") {
      try {
        const campo = await chamar(`/payments/${resposta.id}/identificationField`);
        boletoLine = campo?.identificationField || null;
      } catch (err) {
        console.error("[billing] falha ao buscar linha digitável do boleto:", err.message);
      }
    }

    return {
      providerChargeId: String(resposta.id),
      status: traduzirStatus(resposta.status) || "pending",
      pixCode,
      boletoLine,
      checkoutUrl: resposta.invoiceUrl || resposta.bankSlipUrl || null,
      dueAt: resposta.dueDate || null,
    };
  },

  async consultarCobranca(providerChargeId) {
    if (!providerChargeId) return { status: null };
    const r = await chamar(`/payments/${providerChargeId}`);
    return { status: traduzirStatus(r?.status), failureReason: null };
  },

  // Placeholder de propósito - ver o comentário grande no topo do arquivo sobre
  // por que a assinatura de cartão nasce no checkout, não aqui.
  async criarAssinatura({ method }) {
    if (method !== "card") {
      const err = new Error("Débito automático só existe no cartão.");
      err.code = "METHOD_NOT_RECURRING";
      throw err;
    }
    return { providerSubscriptionId: null, status: "active" };
  },

  async cancelarAssinatura(providerSubscriptionId) {
    // Sem id ainda (checkout não completou, ou nunca foi criado no Asaas) não há
    // o que cancelar do lado deles.
    if (!providerSubscriptionId) return { status: "canceled" };
    await chamar(`/subscriptions/${providerSubscriptionId}`, { method: "DELETE" });
    return { status: "canceled" };
  },

  // Traduz o aviso. NÃO decide nada sobre o pagamento: devolve o id e um pedido
  // de consulta, do mesmo jeito que o Mercado Pago - o corpo do webhook não é
  // confiável por hábito do projeto, mesmo o Asaas mandando mais dado nele.
  //
  // externalReference e providerSubscriptionId alimentam o encaixe que
  // routes/billingWebhook.js faz quando ainda NÃO existe uma linha local
  // encontrável pelo id de cobrança (checkout que acabou de completar, ou
  // renovação de assinatura que o próprio Asaas disparou sozinho).
  lerWebhook(req) {
    if (!validarToken(req)) return null;
    const corpo = req.body || {};
    const pagamento = corpo.payment;
    if (!pagamento?.id) return null;
    return {
      providerChargeId: String(pagamento.id),
      externalReference: pagamento.externalReference || null,
      providerSubscriptionId: pagamento.subscription || null,
      consultar: true,
    };
  },
};

// Token fixo, não HMAC: o Asaas manda o valor configurado no cabeçalho
// asaas-access-token, e comparar por igualdade (constant-time) é a autenticação
// inteira - ver docs.asaas.com/docs/webhooks-3. Sem segredo configurado a
// validação não pode "passar por padrão", pelo mesmo motivo do Mercado Pago: um
// POST forjado não pode confirmar pagamento.
export function validarToken(req) {
  const segredo = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!segredo) return false;
  const recebido = req.get("asaas-access-token") || "";

  const a = Buffer.from(segredo, "utf8");
  const b = Buffer.from(recebido, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
