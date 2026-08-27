// Registro dos módulos no cliente: ícone, cor de destaque e chaves de i18n de
// cada pilar. O servidor (server/modules.js) é a autoridade do que existe e do
// que está liberado; este arquivo é só a camada visual, e a lista de ids precisa
// ficar em sincronia com a de lá na mão — o cliente não importa o módulo do
// servidor (bundle separado), mesmo hábito de ALL_VIEWS/plans.js.
//
// labelKey/descKey apontam para modules.<id>.* nos locales. accent é a cor do
// card no launcher. icon nomeia o desenho em ModuleIcon (abaixo). category
// alimenta as abas de filtro do launcher (ver CATEGORIES em ModuleLauncher.jsx)
// - só existem categorias com pelo menos um módulo real; o resto (Atendimento,
// Saúde & Clínicas, RH, Modelos de IA) fica com o selo "Em breve" na aba.
//
// tagKey é o texto da pill exibida no card (ver .module-card-tag em
// ModuleLauncher.jsx) - independente de category de propósito. O quadro
// Kanban mora na aba "Vendas" (compartilha filtro com Vendas & CRM, é onde o
// time comercial mais usa), mas rotulado "Vendas" no card ficava errado: é
// uma ferramenta genérica, não exclusiva de vendas. Sem tagKey, o card cai de
// volta no rótulo da própria category (ver metaFor/categoriaDaAba).
//
// accent era um arco-íris (um tom por pilar, sem relação com a marca); agora é
// o azul-marinho da marca (#101f47, o mesmo de .landing-shell/.auth-shell) em
// todos - o pedido foi "ícones com as cores da marca", não uma cor por módulo.
const BRAND = "#101f47";

export const MODULE_META = {
  quadro: { icon: "quadro", accent: BRAND, category: "vendas", tagKey: "modules.quadro.tag", labelKey: "modules.quadro.name", descKey: "modules.quadro.desc" },
  "vendas-crm": { icon: "vendas", accent: BRAND, category: "vendas", tagKey: "modules.vendas-crm.tag", labelKey: "modules.vendas-crm.name", descKey: "modules.vendas-crm.desc" },
  // Ícone "layers" (não o cifrão) de propósito: o card representa o ERP IRES
  // inteiro (Financeiro, Compras & Estoque, Faturamento, Relatórios & BI - ver
  // FinanceiroModule.jsx), não só a parte financeira. O cifrão continua valendo
  // só para o grupo "Financeiro" de dentro da sidebar do módulo.
  financeiro: { icon: "layers", accent: BRAND, category: "financeiro", tagKey: "modules.financeiro.tag", labelKey: "modules.financeiro.name", descKey: "modules.financeiro.desc" },
  "saude-clinicas": { icon: "saude", accent: BRAND, category: "saude", tagKey: "modules.saude-clinicas.tag", labelKey: "modules.saude-clinicas.name", descKey: "modules.saude-clinicas.desc" },
  // Vertical separada pra salões/clínicas de estética - categoria "saude"
  // reaproveitada (mesma aba de filtro de Saúde & Clínicas) em vez de criar
  // uma aba "Beleza" própria: a barra de categorias não pode crescer sem
  // limite (ver comentário de CATEGORIES em ModuleLauncher.jsx).
  "xaphires-beauty": { icon: "beauty", accent: BRAND, category: "saude", tagKey: "modules.xaphires-beauty.tag", labelKey: "modules.xaphires-beauty.name", descKey: "modules.xaphires-beauty.desc" },
  // Compras & Estoque, Faturamento e Relatórios & BI saíram daqui - viraram abas
  // "Em breve" dentro do ERP IRES (id "financeiro" acima), não cards próprios do
  // launcher. Os nomes (modules.<id>.name/.desc) continuam nos locales, agora
  // reaproveitados como rótulo das abas (ver FinanceiroModule.jsx).
  // Marketing e Jurídico não têm pilar real (não vêm de server/modules.js) e
  // não têm aba própria na barra de filtro - o pedido foi mantê-los visíveis
  // mesmo assim, como cartão travado dentro de "outros" (ver
  // PILARES_PLACEHOLDER em ModuleLauncher.jsx, que injeta esses dois ids na
  // lista de módulos com enabled:false antes de filtrar por categoria).
  marketing: { icon: "marketing", accent: BRAND, category: "outros", labelKey: "modules.marketing.name", descKey: "modules.marketing.desc" },
  juridico: { icon: "juridico", accent: BRAND, category: "outros", labelKey: "modules.juridico.name", descKey: "modules.juridico.desc" },
  // Apontamento de horas - ferramenta transversal (qualquer empresa usa,
  // independente do ramo), sem pilar próprio na barra de filtro; cai em
  // "outros" como marketing/jurídico acima.
  "time-tracking": { icon: "tempo", accent: BRAND, category: "outros", labelKey: "modules.time-tracking.name", descKey: "modules.time-tracking.desc" },
};

export function metaFor(id) {
  return MODULE_META[id] || { icon: "vendas", accent: BRAND, labelKey: id, descKey: "" };
}
