// Definição dos planos e das regras de acesso derivadas deles.
// Este arquivo é a autoridade: o cliente só exibe o que o servidor calcula aqui.

export const TRIAL_DAYS = 7;

// rank ordena os planos; priceCents é a mensalidade em centavos de BRL.
// priceCents null significaria "sob consulta" — sem valor de tabela, então não
// poderia ser contratado sozinho. Não há plano assim hoje (o Enterprise passou a
// ter preço de tabela e autoatendimento igual aos demais), mas o resto do
// arquivo (canSelfSelectPlan, priceCentsOf, o desconto em routes/plan.js) trata
// esse caso de propósito, para comportar um futuro plano "sob consulta" de novo.
// autoArchive é o direito à regra de arquivamento automático: o arquivamento
// manual está em todos os planos, só a automação é paga.
//
// O valor é em CENTAVOS INTEIROS, e não em reais decimais, porque é ele que entra
// em soma, proporcional e comparação com o que o gateway confirma. Float em
// dinheiro acumula erro: 349.99 não é representável em binário, e um cálculo de
// proporcional em cima disso fecha com centavo de diferença do extrato. O campo
// `price` em reais continua existindo, derivado, só para exibição.
// Toda visão que existe no ViewSwitcher do cliente (src/components/ViewSwitcher.jsx)
// - as duas listas precisam continuar em sincronia na mão, porque o cliente não
// importa este arquivo (bundle separado). maxBoards e views null significam "sem
// teto"/"todas liberadas", mesmo espírito do maxUsers null = ilimitado.
export const ALL_VIEWS = ["board", "table", "calendar", "dashboard", "map", "matrix"];

// autoArchive/bottleneckMonitor/taskTicker/personalPlanner só entram no
// Profissional para cima - o Intermediário fica só com teto maior de usuário/
// anexo, quadros ilimitados e as 7 visões. recurringCards já era exclusivo do
// Profissional antes disso; agora os cinco sobem juntos no mesmo degrau.
//
// beautyFinance (financeiro/comissão do módulo Xaphires Beauty) e
// beautyOnlineBooking (link público de agendamento) seguem o mesmo desenho
// de degrau dos campos acima, mapeados 1:1 nas fases do módulo: o núcleo
// (clientes/serviços/agenda) é grátis em todo plano - só financeiro/equipe
// (Fase 2) e agendamento online (Fase 4) são pagos.
//
// legacy:true marca os 4 planos de antes da precificação modular (ver os 5
// novos abaixo). Continuam cobrando e funcionando exatamente como sempre -
// getPlan()/priceCentsOf()/effectiveStatus() não distinguem legacy de novo,
// só canSelfSelectPlan() (abaixo) recusa oferecer um legacy pra quem não já
// está nele. Sem isso, remapear quem já paga pros novos preços (ex.:
// Intermediário R$530 -> Starter R$149) cortaria receita de gente que nunca
// pediu desconto - decisão de negócio, não algo pra automatizar em silêncio.
// maxModules:null neles preserva o comportamento de sempre (sem teto de
// módulo add-on, igual hoje).
const DEFINICOES = {
  basic: { rank: 0, maxUsers: 7, paid: false, priceCents: 0, autoArchive: false, recurringCards: false, bottleneckMonitor: false, maxAttachmentBytes: 10 * 1024 * 1024, maxBoards: 4, views: ["board", "table", "calendar"], taskTicker: false, personalPlanner: false, beautyFinance: false, beautyOnlineBooking: false, legacy: true, maxModules: null },
  intermediate: { rank: 1, maxUsers: 15, paid: true, priceCents: 53000, autoArchive: false, recurringCards: false, bottleneckMonitor: false, maxAttachmentBytes: 50 * 1024 * 1024, maxBoards: null, views: null, taskTicker: false, personalPlanner: false, beautyFinance: true, beautyOnlineBooking: false, legacy: true, maxModules: null },
  professional: { rank: 2, maxUsers: null, paid: true, priceCents: 185000, autoArchive: true, recurringCards: true, bottleneckMonitor: true, maxAttachmentBytes: 50 * 1024 * 1024, maxBoards: null, views: null, taskTicker: true, personalPlanner: true, beautyFinance: true, beautyOnlineBooking: true, legacy: true, maxModules: null }, // null = ilimitado
  enterprise: { rank: 3, maxUsers: null, paid: true, priceCents: 378000, autoArchive: true, recurringCards: true, bottleneckMonitor: true, maxAttachmentBytes: 50 * 1024 * 1024, maxBoards: null, views: null, taskTicker: true, personalPlanner: true, beautyFinance: true, beautyOnlineBooking: true, legacy: true, maxModules: null },

  // Precificação modular (catálogo de autoatendimento atual). rank continua
  // acima dos 4 legacy (4-8): não competem por "subir de plano" com eles,
  // e um legacy nunca teria alvo.rank > atual.rank menor que um novo por
  // acidente. maxModules conta só módulo ADD-ON (não-core, ver modules.js) -
  // free não leva nenhum, e fullsuite/enterprise usam null (todos os que
  // existirem agora ou vierem a existir, sem hardcodar a contagem de hoje).
  free: { rank: 4, maxUsers: 7, paid: false, priceCents: 0, autoArchive: false, recurringCards: false, bottleneckMonitor: false, maxAttachmentBytes: 10 * 1024 * 1024, maxBoards: 4, views: ["board", "table", "calendar"], taskTicker: false, personalPlanner: false, beautyFinance: false, beautyOnlineBooking: false, maxModules: 0 },
  starter: { rank: 5, maxUsers: 5, paid: true, priceCents: 14900, autoArchive: false, recurringCards: false, bottleneckMonitor: false, maxAttachmentBytes: 50 * 1024 * 1024, maxBoards: null, views: null, taskTicker: false, personalPlanner: false, beautyFinance: true, beautyOnlineBooking: false, maxModules: 1 },
  growth: { rank: 6, maxUsers: 15, paid: true, priceCents: 39000, autoArchive: true, recurringCards: true, bottleneckMonitor: true, maxAttachmentBytes: 50 * 1024 * 1024, maxBoards: null, views: null, taskTicker: true, personalPlanner: true, beautyFinance: true, beautyOnlineBooking: true, maxModules: 3 },
  fullsuite: { rank: 7, maxUsers: 30, paid: true, priceCents: 89000, autoArchive: true, recurringCards: true, bottleneckMonitor: true, maxAttachmentBytes: 50 * 1024 * 1024, maxBoards: null, views: null, taskTicker: true, personalPlanner: true, beautyFinance: true, beautyOnlineBooking: true, maxModules: null },
  // Id "custom" porque "enterprise" já é o legacy acima - preço de tabela
  // R$1.990 é o piso ("a partir de" no copy); negociação além disso é
  // fora da banda, tratada fora do autoatendimento (mesmo caminho de
  // sempre: contato comercial, ajuste manual pelo painel).
  custom: { rank: 8, maxUsers: null, paid: true, priceCents: 199000, autoArchive: true, recurringCards: true, bottleneckMonitor: true, maxAttachmentBytes: 50 * 1024 * 1024, maxBoards: null, views: null, taskTicker: true, personalPlanner: true, beautyFinance: true, beautyOnlineBooking: true, maxModules: null },
};

// price derivado de priceCents num único lugar, para os dois nunca discordarem.
export const PLANS = Object.fromEntries(
  Object.entries(DEFINICOES).map(([id, def]) => [
    id,
    { id, ...def, price: def.priceCents === null ? null : def.priceCents / 100 },
  ])
);

export const PLAN_IDS = Object.keys(PLANS);
// "growth" é o tier novo com o mesmo espírito do antigo "professional"
// (legacy): grupo inteiro de features pagas liberado, é o que dá o gosto
// certo do produto durante o teste.
export const DEFAULT_TRIAL_PLAN = "growth";

export function getPlan(planId) {
  return PLANS[planId] || PLANS.basic;
}

// Valor a cobrar por um ciclo do plano, em centavos. null só existiria pra um
// plano sob consulta, sem cobrança automática — hoje nenhum plano está nesse caso.
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
  // Bloqueio administrativo vence tudo, inclusive plano pago em dia. É decisão da
  // plataforma, e por isso não pode ser desfeito por pagamento nem por troca de
  // plano — só pelo painel que bloqueou.
  if (company?.blocked_at) return "blocked";
  // Acesso permanente (cortesia/prêmio) vence o vencimento: ignora expires_at/grace
  // por completo, mas continua atrás do bloqueio administrativo - conceder cortesia
  // não é imunidade a decisão da plataforma.
  if (company?.permanent_access_at) return "active";
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

const SEM_ESCRITA = new Set(["expired", "blocked"]);

export function isWritable(company, now = new Date()) {
  return !SEM_ESCRITA.has(effectiveStatus(company, now));
}

// Quantos dias faltam. Negativo significa vencido; null quando não há prazo.
export function daysLeft(company, now = new Date()) {
  if (!company?.expires_at) return null;
  return Math.ceil((new Date(company.expires_at) - now) / 86400000);
}

// Teto de usuários efetivo: a exceção administrativa da empresa
// (companies.max_users_override) vence o do plano quando presente. NULL no
// override significa "sem exceção, usa o do plano" - ver o comentário na coluna,
// em directory.js, sobre por que não existe um valor de override para "ilimitado".
export function maxUsersFor(company) {
  if (company?.max_users_override != null) return company.max_users_override;
  return getPlan(company?.plan).maxUsers;
}

// null como limite significa ilimitado, então qualquer contagem cabe.
export function canAddUser(company, currentUserCount) {
  const max = maxUsersFor(company);
  return max === null || currentUserCount < max;
}

// Quantos módulos ADD-ON (não-core, ver modules.js) o plano da empresa
// permite ligar. null = sem teto (todos os que existirem). Sem override por
// empresa hoje - diferente de maxUsersFor/attachmentLimitFor, a concessão de
// módulo específico já é a válvula de exceção (painel admin escreve
// enabled_modules direto, ignorando este teto - ver comentário em
// server/routes/admin.js sobre a checagem ser só informativa).
export function maxModulesFor(company) {
  return getPlan(company?.plan).maxModules;
}

// Mesmo par maxUsersFor/canAddUser, para quadros. Sem override por empresa (a
// exceção administrativa de usuário/anexo existe porque cliente grande pede
// caso a caso; teto de quadro do Básico não teve esse pedido até aqui - se
// vier, é só seguir o mesmo padrão de company.max_users_override).
export function maxBoardsFor(company) {
  return getPlan(company?.plan).maxBoards;
}

export function canAddBoard(company, currentBoardCount) {
  const max = maxBoardsFor(company);
  return max === null || currentBoardCount < max;
}

// Visões liberadas para o plano - null em DEFINICOES.views significa "todas".
// O Básico só recebe as três que não dependem de nenhuma automação paga
// (Kanban, Tabela, Calendário); as outras quatro (Gantt, Painel, Mapa, Matriz
// Eisenhower) só leem os mesmos dados do cartão, então a barreira aqui é só de
// UI - o servidor não tem uma rota própria por visão para travar de verdade.
export function viewsFor(planId) {
  return getPlan(planId).views || ALL_VIEWS;
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
// Um plano sob consulta (price null) ficaria de fora sempre - não há o que
// contratar sozinho sem preço de tabela. Não é o caso de nenhum plano hoje.
export function canSelfSelectPlan(company, targetPlanId) {
  const alvo = PLANS[targetPlanId];
  if (!alvo) return false;
  if (alvo.price === null) return false;
  // Empresa bloqueada não sai do bloqueio contratando plano. O bloqueio é decisão
  // da plataforma; pagar não deve desfazê-lo.
  if (company?.blocked_at) return false;
  // Legacy só continua vigente pra quem já está nele - autoatendimento nunca
  // OFERECE um legacy pra ninguém de novo (ver comentário em DEFINICOES).
  if (alvo.legacy && company?.plan !== targetPlanId) return false;

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
// A partir do Profissional - mesmo degrau dos cartões recorrentes.
export function canUseAutoArchive(planId) {
  return getPlan(planId).autoArchive === true;
}

// Direito aos cartões recorrentes. Mesmo degrau do arquivamento automático,
// do monitor de gargalos, do letreiro e do Planejador pessoal: todos entram
// juntos a partir do Profissional.
export function canUseRecurringCards(planId) {
  return getPlan(planId).recurringCards === true;
}

// Direito ao monitor de gargalos. Mesmo degrau do arquivamento automático.
export function canUseBottleneckMonitor(planId) {
  return getPlan(planId).bottleneckMonitor === true;
}

// Direito ao letreiro de tarefas pendentes. A partir do Profissional - mesmo
// espírito de canUseAutoArchive/canUseBottleneckMonitor, mas sem rota
// própria pra travar: o letreiro só lê os cartões que o quadro já trouxe, então
// a barreira aqui é de UI (mesmo caso de viewsFor, ver comentário lá).
export function canUseTaskTicker(planId) {
  return getPlan(planId).taskTicker === true;
}

// Direito ao Planejador pessoal (agenda fora de quadros). Mesmo degrau do
// arquivamento automático e do monitor de gargalos - a partir do Profissional.
export function canUsePersonalPlanner(planId) {
  return getPlan(planId).personalPlanner === true;
}

// Direito ao financeiro (ledger de pagamento + comissão) e à gestão de
// equipe do módulo Xaphires Beauty. A partir do Premium (intermediate) -
// diferente dos direitos acima, que começam no Profissional: o núcleo do
// Beauty (agenda) já é o produto vendido, financeiro é só o primeiro degrau
// pago dele, não o topo.
export function canUseBeautyFinance(planId) {
  return getPlan(planId).beautyFinance === true;
}

// Direito ao link público de agendamento (Fase 4 do módulo) - a partir do
// Profissional, mesmo degrau de autoArchive/recurringCards: é o recurso que
// expõe a agenda para fora da empresa, faz sentido no topo da régua.
export function canUseBeautyOnlineBooking(planId) {
  return getPlan(planId).beautyOnlineBooking === true;
}

// Teto de anexo efetivo, em bytes. O gratuito fica com 10 MB e os pagos com 50; a
// exceção administrativa da empresa (companies.max_attachment_bytes_override)
// vence esse padrão quando presente, mesma regra de maxUsersFor. Recebe a empresa
// inteira (não só o id do plano) por causa disso - subir o teto do plano em si
// continua sendo só trocar o número em DEFINICOES, o upload é em streaming e o
// arquivo nunca fica inteiro na memória.
export function attachmentLimitFor(company) {
  if (company?.max_attachment_bytes_override != null) return company.max_attachment_bytes_override;
  return getPlan(company?.plan).maxAttachmentBytes;
}
