// Registro dos módulos no cliente: ícone, cor de destaque e chaves de i18n de
// cada pilar. O servidor (server/modules.js) é a autoridade do que existe e do
// que está liberado; este arquivo é só a camada visual, e a lista de ids precisa
// ficar em sincronia com a de lá na mão — o cliente não importa o módulo do
// servidor (bundle separado), mesmo hábito de ALL_VIEWS/plans.js.
//
// labelKey/descKey apontam para modules.<id>.* nos locales. accent é a cor do
// card no launcher. icon nomeia o desenho em ModuleIcon (abaixo).

export const MODULE_META = {
  "vendas-crm": { icon: "vendas", accent: "#6366f1", labelKey: "modules.vendas-crm.name", descKey: "modules.vendas-crm.desc" },
  financeiro: { icon: "financeiro", accent: "#10b981", labelKey: "modules.financeiro.name", descKey: "modules.financeiro.desc" },
  "compras-estoque": { icon: "estoque", accent: "#f59e0b", labelKey: "modules.compras-estoque.name", descKey: "modules.compras-estoque.desc" },
  faturamento: { icon: "faturamento", accent: "#ec4899", labelKey: "modules.faturamento.name", descKey: "modules.faturamento.desc" },
  "relatorios-bi": { icon: "bi", accent: "#3b82f6", labelKey: "modules.relatorios-bi.name", descKey: "modules.relatorios-bi.desc" },
};

export function metaFor(id) {
  return MODULE_META[id] || { icon: "vendas", accent: "var(--accent)", labelKey: id, descKey: "" };
}
