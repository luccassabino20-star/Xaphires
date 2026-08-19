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
// Saúde & Clínicas, RH, Modelos de IA) fica com o selo "Em breve" na aba,
// porque hoje não haveria nada pra mostrar nelas.
//
// accent era um arco-íris (um tom por pilar, sem relação com a marca); agora é
// o azul-marinho da marca (#101f47, o mesmo de .landing-shell/.auth-shell) em
// todos - o pedido foi "ícones com as cores da marca", não uma cor por módulo.
const BRAND = "#101f47";

export const MODULE_META = {
  quadro: { icon: "quadro", accent: BRAND, category: "vendas", labelKey: "modules.quadro.name", descKey: "modules.quadro.desc" },
  "vendas-crm": { icon: "vendas", accent: BRAND, category: "vendas", labelKey: "modules.vendas-crm.name", descKey: "modules.vendas-crm.desc" },
  financeiro: { icon: "financeiro", accent: BRAND, category: "financeiro", labelKey: "modules.financeiro.name", descKey: "modules.financeiro.desc" },
  "saude-clinicas": { icon: "saude", accent: BRAND, category: "saude", labelKey: "modules.saude-clinicas.name", descKey: "modules.saude-clinicas.desc" },
  "compras-estoque": { icon: "estoque", accent: BRAND, category: "outros", labelKey: "modules.compras-estoque.name", descKey: "modules.compras-estoque.desc" },
  faturamento: { icon: "faturamento", accent: BRAND, category: "financeiro", labelKey: "modules.faturamento.name", descKey: "modules.faturamento.desc" },
  "relatorios-bi": { icon: "bi", accent: BRAND, category: "outros", labelKey: "modules.relatorios-bi.name", descKey: "modules.relatorios-bi.desc" },
  // Marketing e Jurídico não têm pilar real (não vêm de server/modules.js) e
  // não têm aba própria na barra de filtro - o pedido foi mantê-los visíveis
  // mesmo assim, como cartão travado dentro de "outros" (ver
  // PILARES_PLACEHOLDER em ModuleLauncher.jsx, que injeta esses dois ids na
  // lista de módulos com enabled:false antes de filtrar por categoria).
  marketing: { icon: "marketing", accent: BRAND, category: "outros", labelKey: "modules.marketing.name", descKey: "modules.marketing.desc" },
  juridico: { icon: "juridico", accent: BRAND, category: "outros", labelKey: "modules.juridico.name", descKey: "modules.juridico.desc" },
};

export function metaFor(id) {
  return MODULE_META[id] || { icon: "vendas", accent: BRAND, labelKey: id, descKey: "" };
}
