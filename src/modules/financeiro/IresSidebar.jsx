import { useState } from "react";
import { useTranslation } from "react-i18next";
import ModuleIcon from "../ModuleIcon.jsx";

// Ícones próprios da sidebar do ERP IRES - mesmo padrão de CardIcon.jsx
// (Saúde & Clínicas): SVG inline, sem biblioteca. Os três "futuros" reaproveitam
// ModuleIcon (mesmos ícones que já tinham como card no launcher, antes de virar
// item de sidebar aqui dentro).
const PATHS = {
  // Cifrão / fluxo de caixa - mesmo traço de ModuleIcon.financeiro
  financeiro: "M12 2v2m0 16v2m5-14a4 4 0 0 0-4-3H11a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-1a4 4 0 0 1-4-3",
  // Barras + linha de base
  relatorios: "M4 20V10m5 10V4m5 16v-7m5 7V8M4 20h16",
  // Duas pessoas - "Users"
  cadastros: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 10v-2a4 4 0 0 0-3-3.87M15 3.13A4 4 0 0 1 15 10.87",
};
function Icon({ name, size = 19 }) {
  const d = PATHS[name];
  if (!d) return <ModuleIcon name={name} size={size} />;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Estrutura pedida: Financeiro e Relatórios & DRE são grupos com submenu
// (accordion); Cadastros entra como "grupo" sem `children` - a própria
// CadastrosView.jsx já tem a divisão interna (Clientes/Fornecedores, Classes,
// Centros de custo...), então duplicar isso aqui em cima seria um menu dentro
// do outro pelo mesmo dado. O header de Cadastros É o link (sem seta, sem
// expandir).
const GRUPOS = [
  {
    id: "grupo-financeiro", icon: "financeiro", labelKey: "financeiro.sidebar.grupo.financeiro",
    children: [
      { id: "lancamentos" },
      { id: "titulos" },
      { id: "movimentacao" },
      { id: "contas", labelKey: "financeiro.sidebar.itens.contas" },
      { id: "importar", labelKey: "financeiro.sidebar.itens.importar" },
    ],
  },
  {
    id: "grupo-relatorios", icon: "relatorios", labelKey: "financeiro.sidebar.grupo.relatorios",
    children: [
      { id: "fluxo" },
      { id: "matriz" },
      { id: "dre" },
    ],
  },
  { id: "cadastros", icon: "cadastros", labelKey: "financeiro.tabs.cadastros" },
];

// Compras & Estoque, Faturamento e Relatórios & BI - ver o comentário em
// FinanceiroModule.jsx sobre por que viram popover em vez de navegar.
export const ITENS_FUTUROS = [
  { id: "compras-estoque", icon: "estoque", labelKey: "modules.compras-estoque.name", descKey: "modules.compras-estoque.desc" },
  { id: "faturamento", icon: "faturamento", labelKey: "modules.faturamento.name", descKey: "modules.faturamento.desc" },
  { id: "relatorios-bi", icon: "bi", labelKey: "modules.relatorios-bi.name", descKey: "modules.relatorios-bi.desc" },
];

export default function IresSidebar({ collapsed, onToggleCollapsed, aba, onSelectAba, onAbrirFuturo }) {
  const { t } = useTranslation();
  // Grupo com a aba ativa já começa aberto - senão a pessoa abriria o módulo
  // numa sub-seção (ex.: "fluxo") e ela ficaria escondida dentro de um grupo
  // fechado, mesmo comportamento de SaudeSidebar.jsx.
  const [grupoAberto, setGrupoAberto] = useState(() =>
    GRUPOS.filter((g) => g.children).map((g) => g.id).filter((id) =>
      GRUPOS.find((g) => g.id === id).children.some((c) => c.id === aba)
    )
  );

  function clicarGrupo(grupo) {
    if (!grupo.children) return onSelectAba(grupo.id);
    if (collapsed) return onSelectAba(grupo.children[0].id);
    setGrupoAberto((atual) => (atual.includes(grupo.id) ? atual.filter((id) => id !== grupo.id) : [...atual, grupo.id]));
  }

  return (
    <aside className={"fin-sidebar" + (collapsed ? " fin-sidebar-collapsed" : "")}>
      <button
        type="button"
        className="fin-sidebar-toggle"
        onClick={onToggleCollapsed}
        title={t(collapsed ? "financeiro.sidebar.expandir" : "financeiro.sidebar.recolher")}
      >
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
        </svg>
      </button>

      <nav className="fin-sidebar-nav">
        {GRUPOS.map((grupo) => {
          const grupoAtivo = grupo.children ? grupo.children.some((c) => c.id === aba) : aba === grupo.id;
          const aberto = grupoAberto.includes(grupo.id);
          return (
            <div key={grupo.id} className="fin-sidebar-group">
              <button
                type="button"
                className={"fin-sidebar-item" + (grupoAtivo ? " active" : "")}
                onClick={() => clicarGrupo(grupo)}
                title={collapsed ? t(grupo.labelKey) : undefined}
              >
                <span className="fin-sidebar-item-icon"><Icon name={grupo.icon} /></span>
                {!collapsed && <span className="fin-sidebar-item-label">{t(grupo.labelKey)}</span>}
                {!collapsed && grupo.children && (
                  <svg className={"fin-sidebar-chevron" + (aberto ? " fin-sidebar-chevron-aberto" : "")} viewBox="0 0 24 24" width="13" height="13">
                    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </svg>
                )}
              </button>
              {!collapsed && grupo.children && aberto && (
                <div className="fin-sidebar-subnav">
                  {grupo.children.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={"fin-sidebar-subitem" + (aba === item.id ? " active" : "")}
                      onClick={() => onSelectAba(item.id)}
                    >
                      {t(item.labelKey || `financeiro.tabs.${item.id}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="fin-sidebar-separador">
          {!collapsed && <span className="fin-sidebar-separador-label">{t("financeiro.sidebar.grupo.futuros")}</span>}
        </div>
        {ITENS_FUTUROS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="fin-sidebar-item fin-sidebar-item-futuro"
            onClick={(e) => onAbrirFuturo(item, e)}
            title={collapsed ? t(item.labelKey) : undefined}
          >
            <span className="fin-sidebar-item-icon"><Icon name={item.icon} /></span>
            {!collapsed && <span className="fin-sidebar-item-label">{t(item.labelKey)}</span>}
            {!collapsed && <span className="fin-sidebar-item-badge">{t("modules.comingSoon")}</span>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
