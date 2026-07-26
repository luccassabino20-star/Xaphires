// Definição dos planos e das regras de acesso derivadas deles.
// Este arquivo é a autoridade: o cliente só exibe o que o servidor calcula aqui.

export const TRIAL_DAYS = 7;

// rank ordena os planos; price é a mensalidade em BRL. price null significa
// "sob consulta" — sem valor de tabela, então não pode ser contratado sozinho.
// autoArchive é o direito à regra de arquivamento automático: o arquivamento
// manual está em todos os planos, só a automação é paga.
export const PLANS = {
  basic: { id: "basic", rank: 0, maxUsers: 3, paid: false, price: 0, autoArchive: false, recurringCards: false, bottleneckMonitor: false, maxAttachmentBytes: 10 * 1024 * 1024 },
  intermediate: { id: "intermediate", rank: 1, maxUsers: 10, paid: true, price: 349.99, autoArchive: true, recurringCards: false, bottleneckMonitor: true, maxAttachmentBytes: 50 * 1024 * 1024 },
  professional: { id: "professional", rank: 2, maxUsers: null, paid: true, price: 679.99, autoArchive: true, recurringCards: true, bottleneckMonitor: true, maxAttachmentBytes: 50 * 1024 * 1024 }, // null = ilimitado
  enterprise: { id: "enterprise", rank: 3, maxUsers: null, paid: true, price: null, autoArchive: true, recurringCards: true, bottleneckMonitor: true, maxAttachmentBytes: 50 * 1024 * 1024 },
};

export const PLAN_IDS = Object.keys(PLANS);
export const DEFAULT_TRIAL_PLAN = "professional";

export function getPlan(planId) {
  return PLANS[planId] || PLANS.basic;
}

export function trialEndsAt(from = new Date()) {
  return new Date(from.getTime() + TRIAL_DAYS * 86400000).toISOString();
}

// Status efetivo, calculado sempre a partir da data — nunca confiando num campo
// que pode ter ficado desatualizado por o servidor estar parado no vencimento.
//
// O plano gratuito não expira: só planos pagos têm prazo. Isso é o que permite
// alguém cair para o Básico depois do teste e continuar usando.
export function effectiveStatus(company, now = new Date()) {
  const plan = getPlan(company?.plan);
  if (!plan.paid) return "active";
  if (!company?.expires_at) return "active";
  return new Date(company.expires_at) > now ? (company.status === "trialing" ? "trialing" : "active") : "expired";
}

export function isWritable(company, now = new Date()) {
  return effectiveStatus(company, now) !== "expired";
}

// Quantos dias faltam. Negativo significa vencido; null quando não há prazo.
export function daysLeft(company, now = new Date()) {
  if (!company?.expires_at) return null;
  return Math.ceil((new Date(company.expires_at) - now) / 86400000);
}

// null como limite significa ilimitado, então qualquer contagem cabe.
export function canAddUser(company, currentUserCount) {
  const max = getPlan(company?.plan).maxUsers;
  return max === null || currentUserCount < max;
}

// Um mês adiante, preservando o dia da contratação. Contratou dia 31, vence dia 31
// nos meses que têm — nos que não têm, cai no último dia, em vez de vazar para o
// mês seguinte como faria um setMonth ingênuo.
export function addOneMonth(iso) {
  const d = new Date(iso);
  const dia = d.getUTCDate();
  const alvo = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())
  );
  const ultimoDiaDoMes = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDiaDoMes));
  return alvo.toISOString();
}

// Que planos a empresa pode contratar sozinha, pelo próprio app.
//
// Com um plano pago EM VIGOR, só subir: descer significa pagar menos no meio de um
// ciclo já contratado, e isso passa por quem cobra, não por um clique.
//
// Sem nada em vigor — plano gratuito, ou pago que já venceu — a escolha é livre
// entre os planos com preço de tabela, inclusive o Básico e inclusive o mesmo
// plano de novo. É o que destrava as duas saídas que antes não existiam: cair
// para o Básico quando o teste termina, e renovar um plano que expirou. Não há
// receita a perder aqui, porque enquanto está vencido a empresa não paga nada e
// não consegue escrever.
//
// O Empresarial fica de fora sempre: é "sob consulta", sem preço de tabela, então
// não há o que contratar sozinho.
export function canSelfSelectPlan(company, targetPlanId) {
  const alvo = PLANS[targetPlanId];
  if (!alvo) return false;
  if (alvo.price === null) return false;

  const atual = getPlan(company?.plan);
  const emVigor = atual.paid && effectiveStatus(company) !== "expired";
  if (!emVigor) return true;

  return alvo.rank > atual.rank;
}

// Direito à regra de arquivamento automático. O arquivamento manual continua em
// todos os planos: o que se paga é a automação, não a funcionalidade inteira.
export function canUseAutoArchive(planId) {
  return getPlan(planId).autoArchive === true;
}

// Direito aos cartões recorrentes. Um degrau acima do arquivamento automático:
// este entra só do Profissional para cima.
export function canUseRecurringCards(planId) {
  return getPlan(planId).recurringCards === true;
}

// Direito ao monitor de gargalos. Mesmo degrau do arquivamento automático.
export function canUseBottleneckMonitor(planId) {
  return getPlan(planId).bottleneckMonitor === true;
}

// Teto de anexo por plano, em bytes. O gratuito fica com 10 MB e os pagos com 50.
// Subir para 200 MB é trocar este número: o upload é em streaming e o arquivo
// nunca fica inteiro na memória, então o limite é política, não restrição técnica.
export function attachmentLimitFor(planId) {
  return getPlan(planId).maxAttachmentBytes;
}
