// Catálogo de add-ons por módulo e as regras de acesso derivadas dele.
// Mesmo papel de plans.js/modules.js: autoridade única do que existe e do
// que custa - o cliente só desenha o que o servidor calcula aqui.
//
// Nenhum add-on daqui desbloqueia uma feature de verdade ainda - são os
// exemplos do copy de marketing (lembrete por WhatsApp, conciliação via
// Open Finance etc.), sem código por trás deles hoje. Existem porque a
// cobrança precisa ser real desde já (reserva de recurso: vende e rastreia
// o direito, mesmo sem a funcionalidade construída) - mesmo espírito da
// Fase 0 do módulo Xaphires Beauty em modules.js. Cada add-on vira uma
// feature de verdade quando alguém decidir construí-la; até lá,
// isAddonEnabled() só serve pra um código futuro consultar.
//
// priceCents aqui é um CHUTE inicial de precificação (R$19-79/mês,
// proporcional ao valor percebido de cada add-on) - não veio de nenhuma
// decisão de negócio registrada. Ajustar é só trocar o número.
//
// moduleId aponta para um id real de modules.js (MODULE_IDS) - um add-on
// só faz sentido se o módulo dono dele já existe.
const DEFINICOES = [
  // ---- Quadro Kanban ----
  { id: "quadro-gantt", moduleId: "quadro", priceCents: 2900, labelKey: "billing.addons.items.quadro-gantt.label", descKey: "billing.addons.items.quadro-gantt.desc" },
  { id: "quadro-anexos", moduleId: "quadro", priceCents: 1900, labelKey: "billing.addons.items.quadro-anexos.label", descKey: "billing.addons.items.quadro-anexos.desc" },
  { id: "quadro-automacoes", moduleId: "quadro", priceCents: 2900, labelKey: "billing.addons.items.quadro-automacoes.label", descKey: "billing.addons.items.quadro-automacoes.desc" },

  // ---- Saúde & Clínicas ----
  { id: "saude-whatsapp", moduleId: "saude-clinicas", priceCents: 4900, labelKey: "billing.addons.items.saude-whatsapp.label", descKey: "billing.addons.items.saude-whatsapp.desc" },
  { id: "saude-prontuario-vip", moduleId: "saude-clinicas", priceCents: 3900, labelKey: "billing.addons.items.saude-prontuario-vip.label", descKey: "billing.addons.items.saude-prontuario-vip.desc" },
  { id: "saude-recall", moduleId: "saude-clinicas", priceCents: 2900, labelKey: "billing.addons.items.saude-recall.label", descKey: "billing.addons.items.saude-recall.desc" },

  // ---- Vendas & CRM ----
  { id: "vendas-pipelines", moduleId: "vendas-crm", priceCents: 3900, labelKey: "billing.addons.items.vendas-pipelines.label", descKey: "billing.addons.items.vendas-pipelines.desc" },
  { id: "vendas-enriquecimento", moduleId: "vendas-crm", priceCents: 5900, labelKey: "billing.addons.items.vendas-enriquecimento.label", descKey: "billing.addons.items.vendas-enriquecimento.desc" },
  { id: "vendas-assinatura", moduleId: "vendas-crm", priceCents: 4900, labelKey: "billing.addons.items.vendas-assinatura.label", descKey: "billing.addons.items.vendas-assinatura.desc" },

  // ---- Financeiro & BPO ----
  // moduleId "finance-bpo" (central executiva), não "financeiro" (ERP IRES) -
  // mesma dualidade já registrada em modules.js: são dois módulos financeiros
  // concorrentes, e os três add-ons abaixo (Open Finance, NF automática, DRE
  // por centro de custo) são vocabulário do finance-bpo especificamente.
  { id: "financebpo-openfinance", moduleId: "finance-bpo", priceCents: 7900, labelKey: "billing.addons.items.financebpo-openfinance.label", descKey: "billing.addons.items.financebpo-openfinance.desc" },
  { id: "financebpo-nf", moduleId: "finance-bpo", priceCents: 5900, labelKey: "billing.addons.items.financebpo-nf.label", descKey: "billing.addons.items.financebpo-nf.desc" },
  { id: "financebpo-dre", moduleId: "finance-bpo", priceCents: 3900, labelKey: "billing.addons.items.financebpo-dre.label", descKey: "billing.addons.items.financebpo-dre.desc" },
];

export const ADDONS = DEFINICOES;
export const ADDON_IDS = DEFINICOES.map((a) => a.id);

export function getAddon(id) {
  return DEFINICOES.find((a) => a.id === id) || null;
}

export function priceCentsOf(addonId) {
  return getAddon(addonId)?.priceCents ?? 0;
}

export function addonsForModule(moduleId) {
  return DEFINICOES.filter((a) => a.moduleId === moduleId);
}

// Soma em centavos de uma lista de ids de add-on, ignorando id desconhecido
// (nunca deveria acontecer - validado na entrada em billing/lifecycle.js -
// mas soma 0 em vez de explodir é mais seguro numa função de cálculo de
// cobrança do que confiar que a validação de fora sempre rodou primeiro).
export function totalPriceCents(addonIds) {
  if (!Array.isArray(addonIds)) return 0;
  return addonIds.reduce((soma, id) => soma + priceCentsOf(id), 0);
}

// Direito da EMPRESA ao add-on: puramente o que está gravado em
// companies.enabled_addons (ver directory.js) - sem segunda camada de
// autorização por usuário, diferente de modules.js/usuarioAutorizado
// (nenhum add-on daqui é dado sensível o bastante pra restringir por
// pessoa, e nenhum tem tela própria ainda pra essa distinção importar).
export function isAddonEnabled(company, addonId) {
  if (!getAddon(addonId)) return false;
  const lista = parseEnabledAddons(company);
  return lista.includes(addonId);
}

function parseEnabledAddons(company) {
  if (!company?.enabled_addons) return [];
  try {
    const arr = JSON.parse(company.enabled_addons);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Catálogo já resolvido pra empresa: todo add-on, agrupado por módulo, com
// o direito atual calculado - é o que GET /api/plan devolve pro cliente
// desenhar a lista de add-ons por módulo sem reimplementar a regra.
export function addonCatalogFor(company) {
  const lista = parseEnabledAddons(company);
  return DEFINICOES.map((a) => ({
    id: a.id,
    moduleId: a.moduleId,
    priceCents: a.priceCents,
    labelKey: a.labelKey,
    descKey: a.descKey,
    enabled: lista.includes(a.id),
  }));
}

export function enabledAddonsFor(company) {
  return parseEnabledAddons(company);
}
