// Definição dos planos e das regras de acesso derivadas deles.
// Este arquivo é a autoridade: o cliente só exibe o que o servidor calcula aqui.

export const TRIAL_DAYS = 7;

export const PLANS = {
  basic: { id: "basic", maxUsers: 3, paid: false },
  intermediate: { id: "intermediate", maxUsers: 10, paid: true },
  professional: { id: "professional", maxUsers: null, paid: true }, // null = ilimitado
  enterprise: { id: "enterprise", maxUsers: null, paid: true },
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
