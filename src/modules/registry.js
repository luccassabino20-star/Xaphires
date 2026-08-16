// Registro dos módulos no cliente: ícone, cor de destaque e chaves de i18n de
// cada pilar. O servidor (server/modules.js) é a autoridade do que existe e do
// que está liberado; este arquivo é só a camada visual, e a lista de ids precisa
// ficar em sincronia com a de lá na mão — o cliente não importa o módulo do
// servidor (bundle separado), mesmo hábito de ALL_VIEWS/plans.js.
//
// labelKey/descKey apontam para modules.<id>.* nos locales. accent é a cor do
// card no launcher. icon nomeia o desenho em ModuleIcon (abaixo).
//
// accent era um arco-íris (um tom por pilar, sem relação com a marca); agora é
// o azul-marinho da marca (#101f47, o mesmo de .landing-shell/.auth-shell) em
// todos - o pedido foi "ícones com as cores da marca", não uma cor por módulo.
const BRAND = "#101f47";

export const MODULE_META = {
  "vendas-crm": { icon: "vendas", accent: BRAND, labelKey: "modules.vendas-crm.name", descKey: "modules.vendas-crm.desc" },
  financeiro: { icon: "financeiro", accent: BRAND, labelKey: "modules.financeiro.name", descKey: "modules.financeiro.desc" },
  "compras-estoque": { icon: "estoque", accent: BRAND, labelKey: "modules.compras-estoque.name", descKey: "modules.compras-estoque.desc" },
  faturamento: { icon: "faturamento", accent: BRAND, labelKey: "modules.faturamento.name", descKey: "modules.faturamento.desc" },
  "relatorios-bi": { icon: "bi", accent: BRAND, labelKey: "modules.relatorios-bi.name", descKey: "modules.relatorios-bi.desc" },
};

export function metaFor(id) {
  return MODULE_META[id] || { icon: "vendas", accent: BRAND, labelKey: id, descKey: "" };
}
