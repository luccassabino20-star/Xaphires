// Definição dos planos e das regras de acesso derivadas deles.
// Este arquivo é a autoridade: o cliente só exibe o que o servidor calcula aqui.

export const TRIAL_DAYS = 7;

// rank ordena os planos; price é a mensalidade em BRL. price null significa
// "sob consulta" — sem valor de tabela, então não pode ser contratado sozinho.
export const PLANS = {
  basic: { id: "basic", rank: 0, maxUsers: 3, paid: false, price: 0 },
  intermediate: { id: "intermediate", rank: 1, maxUsers: 10, paid: true, price: 249.99 },
  professional: { id: "professional", rank: 2, maxUsers: null, paid: true, price: 679.99 }, // null = ilimitado
  enterprise: { id: "enterprise", rank: 3, maxUsers: null, paid: true, price: null },
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

// Só subir de plano é autoatendimento. Descer significa pagar menos, e cancelar
// significa parar de pagar — isso passa por contato, não por um clique.
// O Empresarial fica de fora porque é "sob consulta": sem preço de tabela não há
// o que contratar sozinho.
export function canSelfUpgradeTo(currentPlanId, targetPlanId) {
  const atual = getPlan(currentPlanId);
  const alvo = PLANS[targetPlanId];
  if (!alvo) return false;
  if (alvo.price === null) return false;
  return alvo.rank > atual.rank;
}
