// Persistência da cobrança: assinaturas e pagamentos.
//
// Mora no banco do diretório (global) porque cobrança é da empresa, não de dentro
// de um quadro — o banco por empresa guarda conteúdo, este guarda quem é cliente.
//
// Duas tabelas, com papéis distintos:
//
//   subscriptions  a INTENÇÃO de recorrência. Uma por empresa, no máximo ativa.
//                  Diz qual plano, por qual meio, e quando é a próxima cobrança.
//   payments       o HISTÓRICO de tentativas. Uma linha por cobrança emitida, que
//                  nunca é apagada nem reescrita para outro ciclo. É o extrato.
//
// A verdade sobre ACESSO continua em companies.expires_at, calculada por plans.js.
// A cobrança não decide se a empresa pode escrever: ela empurra o vencimento para
// frente quando um pagamento é confirmado. Assim uma falha aqui nunca tranca quem
// está em dia, e o efectiveStatus segue sendo a única regra de acesso.

import { getDirectoryDb } from "../directory.js";

const db = getDirectoryDb();

db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    plan TEXT NOT NULL,
    method TEXT NOT NULL CHECK(method IN ('card','pix','boleto')),
    status TEXT NOT NULL CHECK(status IN ('active','past_due','canceled')),
    provider TEXT NOT NULL,
    -- Identificador da assinatura no gateway. Só o cartão recorrente tem um: Pix e
    -- boleto não têm débito automático, então a recorrência deles é uma cobrança
    -- nova emitida a cada ciclo por nós.
    provider_subscription_id TEXT,
    next_charge_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    canceled_at TEXT
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    subscription_id TEXT REFERENCES subscriptions(id),
    plan TEXT NOT NULL,
    -- Centavos inteiros. Nunca float: ver o comentário em plans.js.
    amount_cents INTEGER NOT NULL,
    method TEXT NOT NULL CHECK(method IN ('card','pix','boleto')),
    status TEXT NOT NULL CHECK(status IN ('pending','paid','failed','canceled','refunded')),
    provider TEXT NOT NULL,
    provider_charge_id TEXT,
    -- Para onde mandar o cliente pagar. Pix devolve copia-e-cola, boleto devolve
    -- linha digitável e URL, cartão normalmente não devolve nada disso.
    checkout_url TEXT,
    pix_code TEXT,
    boleto_line TEXT,
    -- Período de acesso que este pagamento compra. Guardado no momento da emissão
    -- para o extrato dizer a que mês a cobrança se refere, sem recalcular depois.
    period_start TEXT,
    period_end TEXT,
    attempt INTEGER NOT NULL DEFAULT 1,
    due_at TEXT,
    paid_at TEXT,
    failure_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_payments_company ON payments(company_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_payments_charge ON payments(provider_charge_id);
  CREATE INDEX IF NOT EXISTS idx_subs_company ON subscriptions(company_id);
`);

// Mesmo padrão do db.js: coluna nova entra aqui, idempotente, sem pasta de migrations.
function addColumnIfMissing(tabela, nome, ddl) {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
  if (!colunas.includes(nome)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${ddl}`);
}

// Dados do pagador, guardados na assinatura porque a RENOVAÇÃO precisa deles e roda
// fora do contexto da empresa — a varredura percorre assinaturas de todas as
// empresas de uma vez e não teria como abrir o banco de cada uma para achar o
// e-mail do master.
//
// Só e-mail e documento: nome, endereço e o resto ficam com o gateway. E nunca
// dado de cartão, que não pode passar por aqui de forma alguma.
addColumnIfMissing("subscriptions", "payer_email", "payer_email TEXT");
addColumnIfMissing("subscriptions", "payer_doc", "payer_doc TEXT");

function nowIso() {
  return new Date().toISOString();
}

// ---------- Assinaturas ----------

export function getActiveSubscription(companyId) {
  return (
    db
      .prepare("SELECT * FROM subscriptions WHERE company_id = ? AND status != 'canceled' ORDER BY created_at DESC LIMIT 1")
      .get(companyId) || null
  );
}

export function getSubscription(id) {
  return db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(id) || null;
}

export function createSubscription({
  id,
  companyId,
  plan,
  method,
  provider,
  providerSubscriptionId,
  nextChargeAt,
  payerEmail,
  payerDoc,
}) {
  const agora = nowIso();
  db.prepare(
    `INSERT INTO subscriptions
     (id, company_id, plan, method, status, provider, provider_subscription_id, next_charge_at,
      payer_email, payer_doc, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    companyId,
    plan,
    method,
    provider,
    providerSubscriptionId || null,
    nextChargeAt || null,
    payerEmail || null,
    payerDoc || null,
    agora,
    agora
  );
  return getSubscription(id);
}

export function updateSubscription(id, campos) {
  const atual = getSubscription(id);
  if (!atual) return null;
  db.prepare(
    `UPDATE subscriptions SET plan = ?, method = ?, status = ?, provider_subscription_id = ?,
     next_charge_at = ?, canceled_at = ?, updated_at = ? WHERE id = ?`
  ).run(
    campos.plan ?? atual.plan,
    campos.method ?? atual.method,
    campos.status ?? atual.status,
    campos.providerSubscriptionId === undefined ? atual.provider_subscription_id : campos.providerSubscriptionId,
    campos.nextChargeAt === undefined ? atual.next_charge_at : campos.nextChargeAt,
    campos.canceledAt === undefined ? atual.canceled_at : campos.canceledAt,
    nowIso(),
    id
  );
  return getSubscription(id);
}

// Assinaturas que já deviam ter cobrado. Base da varredura de renovação.
export function subscriptionsDue(agora = nowIso()) {
  return db
    .prepare(
      "SELECT * FROM subscriptions WHERE status IN ('active','past_due') AND next_charge_at IS NOT NULL AND next_charge_at <= ?"
    )
    .all(agora);
}

// ---------- Pagamentos ----------

export function getPayment(id) {
  return db.prepare("SELECT * FROM payments WHERE id = ?").get(id) || null;
}

export function getPaymentByProviderCharge(providerChargeId) {
  if (!providerChargeId) return null;
  return db.prepare("SELECT * FROM payments WHERE provider_charge_id = ?").get(providerChargeId) || null;
}

export function createPayment({
  id,
  companyId,
  subscriptionId,
  plan,
  amountCents,
  method,
  provider,
  providerChargeId,
  checkoutUrl,
  pixCode,
  boletoLine,
  periodStart,
  periodEnd,
  attempt,
  dueAt,
  status,
}) {
  const agora = nowIso();
  db.prepare(
    `INSERT INTO payments
     (id, company_id, subscription_id, plan, amount_cents, method, status, provider, provider_charge_id,
      checkout_url, pix_code, boleto_line, period_start, period_end, attempt, due_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    companyId,
    subscriptionId || null,
    plan,
    amountCents,
    method,
    status || "pending",
    provider,
    providerChargeId || null,
    checkoutUrl || null,
    pixCode || null,
    boletoLine || null,
    periodStart || null,
    periodEnd || null,
    attempt || 1,
    dueAt || null,
    agora,
    agora
  );
  return getPayment(id);
}

// Muda o estado de um pagamento. Só avança: um pagamento já confirmado não volta
// para pendente por um aviso atrasado do gateway chegando fora de ordem, que é
// coisa que acontece de verdade com webhook.
const FINAIS = new Set(["paid", "refunded", "canceled"]);

export function setPaymentStatus(id, status, { paidAt, failureReason, providerChargeId } = {}) {
  const atual = getPayment(id);
  if (!atual) return null;
  if (FINAIS.has(atual.status) && atual.status !== status) {
    // refunded é o único que pode vir depois de paid.
    const permitido = atual.status === "paid" && status === "refunded";
    if (!permitido) return atual;
  }
  db.prepare(
    "UPDATE payments SET status = ?, paid_at = ?, failure_reason = ?, provider_charge_id = ?, updated_at = ? WHERE id = ?"
  ).run(
    status,
    status === "paid" ? paidAt || nowIso() : atual.paid_at,
    failureReason === undefined ? atual.failure_reason : failureReason,
    providerChargeId === undefined ? atual.provider_charge_id : providerChargeId,
    nowIso(),
    id
  );
  return getPayment(id);
}

// Corrige o período que o pagamento comprou, na confirmação. Na emissão o período é
// um palpite contado de hoje; quem paga adiantado ganha o ciclo a partir do fim do
// atual, e sem reescrever aqui o extrato mostraria um intervalo que não foi o
// concedido.
export function setPaymentPeriod(id, periodStart, periodEnd) {
  db.prepare("UPDATE payments SET period_start = ?, period_end = ?, updated_at = ? WHERE id = ?").run(
    periodStart,
    periodEnd,
    new Date().toISOString(),
    id
  );
  return getPayment(id);
}

export function listPayments(companyId, limite = 24) {
  return db
    .prepare("SELECT * FROM payments WHERE company_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(companyId, limite);
}

// Cobrança em aberto do ciclo: evita emitir uma segunda enquanto a primeira ainda
// pode ser paga. Sem isso, a varredura rodando a cada leitura do quadro geraria um
// Pix novo por acesso.
export function pendingPayment(companyId) {
  return (
    db
      .prepare("SELECT * FROM payments WHERE company_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1")
      .get(companyId) || null
  );
}

// Cobranças pendentes cujo prazo passou. Pix expira em 24h e boleto vence: sem
// encerrar as vencidas, a empresa fica travada atrás de um código que já não pode
// ser pago, porque pendingPayment() impede emitir outra.
export function pendingExpired(agora) {
  return db
    .prepare("SELECT * FROM payments WHERE status = 'pending' AND due_at IS NOT NULL AND due_at <= ?")
    .all(agora);
}

// Assinaturas de quem está tentando pagar. É o que distingue cliente com cobrança
// em andamento — que merece carência — de teste que simplesmente terminou.
export function subscriptionsNeedingGrace() {
  return db.prepare("SELECT * FROM subscriptions WHERE status IN ('active','past_due')").all();
}

export function countAttempts(subscriptionId, periodStart) {
  if (!subscriptionId || !periodStart) return 0;
  return db
    .prepare("SELECT COUNT(*) c FROM payments WHERE subscription_id = ? AND period_start = ?")
    .get(subscriptionId, periodStart).c;
}

// Visão pública de um pagamento, para o cliente. Nada de identificador interno do
// gateway: o que a tela precisa é valor, estado e como pagar.
export function publicPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    plan: row.plan,
    amountCents: row.amount_cents,
    method: row.method,
    status: row.status,
    checkoutUrl: row.checkout_url,
    pixCode: row.pix_code,
    boletoLine: row.boleto_line,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dueAt: row.due_at,
    paidAt: row.paid_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  };
}
