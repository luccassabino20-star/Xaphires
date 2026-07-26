// O ciclo de vida da assinatura: emitir cobrança, confirmar pagamento, renovar,
// insistir quando o cartão falha, e desistir na hora certa.
//
// Duas regras que valem para tudo aqui:
//
// 1. CONFIRMAR PAGAMENTO É O ÚNICO CAMINHO QUE LIBERA ACESSO. Nenhuma outra função
//    escreve companies.plan/expires_at. Quem quiser dar acesso passa por
//    confirmarPagamento(), que só é chamada com um pagamento em estado paid.
//
// 2. TUDO É IDEMPOTENTE. varrerCobranca() roda na leitura do quadro, ou seja, dezenas
//    de vezes por sessão e em requisições concorrentes. Nada aqui pode cobrar duas
//    vezes o mesmo ciclo nem emitir um Pix por acesso.

import crypto from "node:crypto";
import { getCompany, setCompanyPlan, setCompanyGrace } from "../directory.js";
import { getPlan, priceCentsOf, addOneMonth, effectiveStatus } from "../plans.js";
import { gateway, metodoTemDebitoAutomatico } from "./gateway.js";
import * as store from "./store.js";

// Dias de escrita liberada depois do vencimento, enquanto a cobrança tenta. Boleto
// compensa em até 3 dias úteis; menos que isso puniria quem pagou em dia.
export const GRACE_DAYS = 5;

// Tentativas de cartão por ciclo, e o espaçamento entre elas em dias a partir do
// vencimento. Três tentativas em uma semana é o costume: recusa por saldo costuma
// resolver sozinha no dia do salário, recusa por cartão expirado não resolve nunca.
export const MAX_TENTATIVAS_CARTAO = 3;
export const ESPACAMENTO_DIAS = [0, 3, 7];

function nowIso() {
  return new Date().toISOString();
}
function uid() {
  return crypto.randomUUID();
}
function maisDias(iso, dias) {
  return new Date(new Date(iso).getTime() + dias * 86400000).toISOString();
}

// ---------- Confirmação: o único caminho que concede acesso ----------

// Aplica um pagamento aprovado: marca como pago, empurra o vencimento e agenda o
// próximo ciclo. Idempotente — chamada duas vezes para o mesmo pagamento (webhook
// duplicado, que é rotina) não estende o acesso duas vezes.
export function confirmarPagamento(paymentId, { paidAt } = {}) {
  const pagamento = store.getPayment(paymentId);
  if (!pagamento) return null;
  if (pagamento.status === "paid") return pagamento; // já aplicado

  const pago = store.setPaymentStatus(paymentId, "paid", { paidAt });
  if (pago?.status !== "paid") return pago;

  const empresa = getCompany(pagamento.company_id);
  // Paga adiantado não perde os dias que restavam: o ciclo novo começa no fim do
  // atual, não em hoje. Já vencido, conta de hoje.
  const base =
    empresa?.expires_at && new Date(empresa.expires_at) > new Date() ? empresa.expires_at : nowIso();
  const novoVencimento = addOneMonth(base);

  setCompanyPlan(pagamento.company_id, {
    plan: pagamento.plan,
    status: "active",
    expiresAt: novoVencimento,
    // contracted_at marca o início do vínculo, então só é reescrito quando o plano
    // muda de fato — renovar não reinicia a data de contratação.
    contractedAt: empresa?.plan === pagamento.plan ? empresa.contracted_at : nowIso(),
  });
  // Pagou: não há mais o que perdoar.
  setCompanyGrace(pagamento.company_id, null);

  if (pagamento.subscription_id) {
    store.updateSubscription(pagamento.subscription_id, {
      plan: pagamento.plan,
      status: "active",
      nextChargeAt: novoVencimento,
    });
  }
  return store.getPayment(paymentId);
}

// Falha de uma tentativa. Não tranca ninguém: só registra e decide se ainda vale
// insistir. Quem tranca é o vencimento passar da carência.
export function registrarFalha(paymentId, motivo) {
  const pagamento = store.getPayment(paymentId);
  if (!pagamento) return null;
  store.setPaymentStatus(paymentId, "failed", { failureReason: motivo || "UNKNOWN" });

  if (!pagamento.subscription_id) return store.getPayment(paymentId);

  const tentativas = store.countAttempts(pagamento.subscription_id, pagamento.period_start);
  const assinatura = store.getSubscription(pagamento.subscription_id);
  const vencimento = pagamento.period_start || nowIso();

  if (tentativas >= MAX_TENTATIVAS_CARTAO) {
    // Esgotou. A assinatura fica inadimplente e para de tentar; a carência não é
    // estendida, então o acesso cai quando o prazo dela terminar.
    store.updateSubscription(pagamento.subscription_id, { status: "past_due", nextChargeAt: null });
  } else {
    // Reagenda para a próxima janela, contada do vencimento e não de agora, para
    // três falhas seguidas não empurrarem o ciclo indefinidamente.
    const proximo = maisDias(vencimento, ESPACAMENTO_DIAS[tentativas] ?? 3);
    store.updateSubscription(pagamento.subscription_id, { status: "past_due", nextChargeAt: proximo });
  }
  return store.getPayment(paymentId);
}

// ---------- Emissão ----------

// Emite a cobrança de um ciclo. Devolve o pagamento criado, já com o estado que o
// gateway respondeu — pago (cartão aprovado), pendente (Pix/boleto) ou falho.
export async function emitirCobranca({ companyId, plan, method, subscriptionId, card, periodStart, attempt }) {
  const centavos = priceCentsOf(plan);
  if (centavos === null) {
    const err = new Error("Plano sob consulta não passa por cobrança automática");
    err.code = "PLAN_NOT_CHARGEABLE";
    throw err;
  }

  const inicio = periodStart || nowIso();
  const resposta = await gateway.criarCobranca({
    amountCents: centavos,
    method,
    plan,
    companyId,
    card,
  });

  const pagamento = store.createPayment({
    id: uid(),
    companyId,
    subscriptionId,
    plan,
    amountCents: centavos,
    method,
    provider: gateway.nome,
    providerChargeId: resposta.providerChargeId,
    checkoutUrl: resposta.checkoutUrl,
    pixCode: resposta.pixCode,
    boletoLine: resposta.boletoLine,
    periodStart: inicio,
    periodEnd: addOneMonth(inicio),
    attempt: attempt || 1,
    dueAt: resposta.dueAt,
    // Nasce sempre pendente e só então transiciona, para o histórico registrar a
    // emissão mesmo que a confirmação falhe no meio.
    status: "pending",
  });

  if (resposta.status === "paid") return confirmarPagamento(pagamento.id);
  if (resposta.status === "failed") return registrarFalha(pagamento.id, resposta.failureReason);
  return pagamento;
}

// ---------- Contratação ----------

// Inicia a assinatura de um plano pago. É o que POST /api/billing/subscribe chama.
//
// Não concede plano nenhum por conta própria: quem concede é a confirmação do
// pagamento. Com cartão aprovado isso acontece na mesma chamada; com Pix e boleto o
// plano só muda quando o pagamento for confirmado, e até lá a empresa continua
// exatamente no acesso que já tinha.
export async function assinar({ companyId, plan, method, card }) {
  const jaPendente = store.pendingPayment(companyId);
  if (jaPendente) {
    const err = new Error("Já existe uma cobrança em aberto. Pague ou aguarde o vencimento dela.");
    err.code = "PAYMENT_ALREADY_PENDING";
    err.payment = jaPendente;
    throw err;
  }

  const anterior = store.getActiveSubscription(companyId);
  if (anterior) {
    // Trocar de plano ou de meio encerra a assinatura antiga: uma empresa não pode
    // ter duas recorrências ativas cobrando ao mesmo tempo.
    if (anterior.provider_subscription_id) {
      try {
        await gateway.cancelarAssinatura(anterior.provider_subscription_id);
      } catch (err) {
        console.error("[billing] falha ao cancelar assinatura anterior no gateway:", err.message);
      }
    }
    store.updateSubscription(anterior.id, { status: "canceled", canceledAt: nowIso(), nextChargeAt: null });
  }

  let providerSubscriptionId = null;
  if (metodoTemDebitoAutomatico(method)) {
    const r = await gateway.criarAssinatura({ plan, method, card });
    if (r.status === "failed") {
      const err = new Error("O cartão foi recusado.");
      err.code = "CARD_DECLINED";
      err.failureReason = r.failureReason;
      throw err;
    }
    providerSubscriptionId = r.providerSubscriptionId;
  }

  const assinatura = store.createSubscription({
    id: uid(),
    companyId,
    plan,
    method,
    provider: gateway.nome,
    providerSubscriptionId,
    // Fica sem próxima cobrança até o primeiro pagamento entrar: quem define o
    // ciclo é a data em que o acesso passa a valer.
    nextChargeAt: null,
  });

  const pagamento = await emitirCobranca({
    companyId,
    plan,
    method,
    subscriptionId: assinatura.id,
    card,
  });

  return { subscription: store.getSubscription(assinatura.id), payment: pagamento };
}

// Troca o meio de pagamento sem cobrar. Vale do próximo ciclo em diante: o ciclo
// atual já está pago, e cobrar de novo agora seria cobrar duas vezes o mesmo mês.
export async function trocarMetodo(subscriptionId, method, card) {
  const assinatura = store.getSubscription(subscriptionId);
  if (!assinatura) return null;

  // Sair do cartão encerra o débito automático no gateway; entrar no cartão cria um.
  if (assinatura.provider_subscription_id && !metodoTemDebitoAutomatico(method)) {
    try {
      await gateway.cancelarAssinatura(assinatura.provider_subscription_id);
    } catch (err) {
      console.error("[billing] falha ao encerrar débito automático:", err.message);
    }
    return store.updateSubscription(subscriptionId, { method, providerSubscriptionId: null });
  }

  if (metodoTemDebitoAutomatico(method)) {
    const r = await gateway.criarAssinatura({ plan: assinatura.plan, method, card });
    if (r.status === "failed") {
      const err = new Error("O cartão foi recusado.");
      err.code = "CARD_DECLINED";
      err.failureReason = r.failureReason;
      throw err;
    }
    // O cartão novo passou: se a assinatura estava inadimplente por recusa, volta a
    // valer e a próxima cobrança é retomada no vencimento que já existia.
    return store.updateSubscription(subscriptionId, {
      method,
      providerSubscriptionId: r.providerSubscriptionId,
      status: assinatura.status === "canceled" ? "canceled" : "active",
    });
  }

  return store.updateSubscription(subscriptionId, { method });
}

export async function cancelarAssinatura(companyId) {
  const assinatura = store.getActiveSubscription(companyId);
  if (!assinatura) return null;
  if (assinatura.provider_subscription_id) {
    try {
      await gateway.cancelarAssinatura(assinatura.provider_subscription_id);
    } catch (err) {
      console.error("[billing] falha ao cancelar no gateway:", err.message);
    }
  }
  // Cancelar não tira o acesso já pago: o vencimento continua valendo até o fim do
  // ciclo que a pessoa pagou. O que para é a renovação.
  return store.updateSubscription(assinatura.id, {
    status: "canceled",
    canceledAt: nowIso(),
    nextChargeAt: null,
  });
}

// ---------- Varredura ----------

// Roda na leitura autenticada, como o arquivamento automático e as rotinas. Sem
// agendador, e por isso obrigada a ser idempotente e barata quando não há nada a
// fazer — o caminho comum é sair no primeiro if.
export async function varrerCobranca(now = new Date()) {
  const agora = now.toISOString();
  const feito = { expirados: 0, emitidos: 0, carencias: 0 };

  // 1. Cobrança pendente que passou do prazo vira cancelada, liberando espaço para
  //    uma nova. Pix expira em 24h: sem isso a empresa ficaria travada para sempre
  //    atrás de um código que já não pode ser pago.
  for (const p of store.pendingExpired(agora)) {
    store.setPaymentStatus(p.id, "canceled", { failureReason: "EXPIRED" });
    feito.expirados++;
  }

  // 2. Assinaturas que já deviam ter cobrado.
  for (const assinatura of store.subscriptionsDue(agora)) {
    // Cobrança em aberto do mesmo ciclo: não emite outra.
    if (store.pendingPayment(assinatura.company_id)) continue;

    const tentativas = store.countAttempts(assinatura.id, assinatura.next_charge_at);
    if (metodoTemDebitoAutomatico(assinatura.method) && tentativas >= MAX_TENTATIVAS_CARTAO) {
      store.updateSubscription(assinatura.id, { status: "past_due", nextChargeAt: null });
      continue;
    }

    try {
      await emitirCobranca({
        companyId: assinatura.company_id,
        plan: assinatura.plan,
        method: assinatura.method,
        subscriptionId: assinatura.id,
        periodStart: assinatura.next_charge_at,
        attempt: tentativas + 1,
      });
      feito.emitidos++;
    } catch (err) {
      // Gateway fora do ar não pode derrubar a leitura do quadro de ninguém.
      console.error(`[billing] falha ao emitir cobrança da empresa ${assinatura.company_id}:`, err.message);
    }
  }

  // 3. Carência para quem venceu com cobrança em andamento. Só aqui, e nunca para
  //    teste terminado: quem nunca teve assinatura não recebe prolongamento.
  for (const assinatura of store.subscriptionsNeedingGrace(agora)) {
    const empresa = getCompany(assinatura.company_id);
    if (!empresa?.expires_at) continue;
    if (effectiveStatus(empresa, now) !== "expired") continue;
    const limite = maisDias(empresa.expires_at, GRACE_DAYS);
    if (new Date(limite) <= now) continue; // carência já esgotada
    if (empresa.grace_until === limite) continue; // já concedida
    setCompanyGrace(assinatura.company_id, limite);
    feito.carencias++;
  }

  return feito;
}

// Confere no gateway o estado de uma cobrança pendente, sem depender do webhook.
// Usado quando o cliente abre a tela de pagamento: aviso perdido é comum, e ficar
// esperando um webhook que não chegou é o que gera "paguei e não liberou".
export async function conferirPagamento(paymentId) {
  const pagamento = store.getPayment(paymentId);
  if (!pagamento || pagamento.status !== "pending") return pagamento;
  try {
    const r = await gateway.consultarCobranca(pagamento.provider_charge_id);
    if (r?.status === "paid") return confirmarPagamento(paymentId);
    if (r?.status === "failed") return registrarFalha(paymentId, r.failureReason);
  } catch (err) {
    console.error("[billing] falha ao consultar cobrança:", err.message);
  }
  return pagamento;
}
