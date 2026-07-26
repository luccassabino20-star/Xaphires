// Definição dos planos e das regras de acesso derivadas deles.
// Este arquivo é a autoridade: o cliente só exibe o que o servidor calcula aqui.

export const TRIAL_DAYS = 7;

// rank ordena os planos; priceCents é a mensalidade em centavos de BRL.
// priceCents null significa "sob consulta" — sem valor de tabela, então não pode
// ser contratado sozinho.
// autoArchive é o direito à regra de arquivamento automático: o arquivamento
// manual está em todos os planos, só a automação é paga.
//
// O valor é em CENTAVOS INTEIROS, e não em reais decimais, porque é ele que entra
// em soma, proporcional e comparação com o que o gateway confirma. Float em
// dinheiro acumula erro: 349.99 não é representável em binário, e um cálculo de
// proporcional em cima disso fecha com centavo de diferença do extrato. O campo
// `price` em reais continua existindo, derivado, só para exibição.
const DEFINICOES = {
  basic: { rank: 0, maxUsers: 3, paid: false, priceCents: 0, autoArchive: false, recurringCards: false, bottleneckMonitor: false, maxAttachmentBytes: 10 * 1024 * 1024 },
  intermediate: { rank: 1, maxUsers: 10, paid: true, priceCents: 34999, autoArchive: true, recurringCards: false, bottleneckMonitor: true, maxAttachmentBytes: 50 * 1024 * 1024 },
  professional: { rank: 2, maxUsers: null, paid: true, priceCents: 67999, autoArchive: true, recurringCards: true, bottleneckMonitor: true, maxAttachmentBytes: 50 * 1024 * 1024 }, // null = ilimitado
  enterprise: { rank: 3, maxUsers: null, paid: true, priceCents: null, autoArchive: true, recurringCards: true, bottleneckMonitor: true, maxAttachmentBytes: 50 * 1024 * 1024 },
};

// price derivado de priceCents num único lugar, para os dois nunca discordarem.
export const PLANS = Object.fromEntries(
  Object.entries(DEFINICOES).map(([id, def]) => [
    id,
    { id, ...def, price: def.priceCents === null ? null : def.priceCents / 100 },
  ])
);

export const PLAN_IDS = Object.keys(PLANS);
export const DEFAULT_TRIAL_PLAN = "professional";

export function getPlan(planId) {
  return PLANS[planId] || PLANS.basic;
}

// Valor a cobrar por um ciclo do plano, em centavos. null quando não há preço de
// tabela: o Empresarial é sob consulta e não passa por cobrança automática.
export function priceCentsOf(planId) {
  return getPlan(planId).priceCents;
}

// Formata centavos como moeda para texto de servidor (mensagem de erro, e-mail).
// A tela usa Intl no cliente, com o idioma de quem está olhando.
export function formatCents(cents) {
  if (cents === null || cents === undefined) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
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
  if (new Date(company.expires_at) > now) return company.status === "trialing" ? "trialing" : "active";
  // Venceu, mas a cobrança concedeu carência: continua escrevendo até o prazo dela.
  // Estado próprio, e não "active", para a tela poder avisar que há pagamento em
  // aberto em vez de dar a impressão de que está tudo resolvido.
  if (company.grace_until && new Date(company.grace_until) > now) return "grace";
  return "expired";
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

  // "Em vigor" é só o plano pago ATIVO. Teste e carência não contam: em nenhum dos
  // dois a empresa está pagando, então não há ciclo contratado a proteger — e tratar
  // teste como vigente travava a conversão, porque durante o teste do Profissional
  // nenhum destino passava, nem pagar pelo próprio plano.
  const atual = getPlan(company?.plan);
  const emVigor = atual.paid && effectiveStatus(company) === "active";
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
