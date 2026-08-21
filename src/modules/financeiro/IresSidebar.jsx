import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Ícones próprios da sidebar do ERP IRES - mesmo padrão de CardIcon.jsx
// (Saúde & Clínicas): SVG inline, sem biblioteca.
const PATHS = {
  // Grid 2x2 - "Painel"
  painel: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z",
  // Duas setas cruzadas - "Transações"
  transacoes: "M7 7h12M15 3l4 4-4 4M17 17H5m2 4-4-4 4-4",
  // Barras + linha de base - "Relatórios"
  relatorios: "M4 20V10m5 10V4m5 16v-7m5 7V8M4 20h16",
  // Engrenagem - "Configurações"
  configuracoes:
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a7.7 7.7 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.6h-4l-.3 2.4a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.7 7.7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.3 2.4h4l.3-2.4a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4z",
};
function Icon({ name, size = 19 }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Estrutura pedida: 4 blocos fixos (Painel/Transações/Relatórios/
// Configurações), cada um com submenu (accordion). `path` é absoluto, sob
// /financas - cada item vira uma rota de verdade (ver Router em
// FinanceiroModule.jsx), navegável por URL/F5/link direto.
//
// Mapeamento pro que já existia (nada foi jogado fora, só reorganizado):
// - Resumo = a antiga aba "Fluxo" (KPIs do ano + gráfico entradas x saídas).
// - Fluxo de caixa = a antiga aba "Matriz" (DRE de caixa em matriz mensal/diária).
// - Extrato = a antiga aba "Movimentação"; Importar extrato virou ação
//   secundária dentro dela (ExtratoView.jsx), não item de menu próprio.
// - Receitas/Despesas = Lançamentos (criar) + Títulos (consultar/baixar) da
//   antiga sidebar, cada um agora com o tipo travado (TransacoesTipoView.jsx).
// - Análise de despesas/receitas = novo, lê o mesmo DRE (financeiro.dre.*)
//   já usado pela aba DRE, só que como ranking por categoria de um lado só.
// - Categorias financeiras/Contas bancárias/Centros de custo/Outras
//   configurações = a antiga aba Cadastros, com 4 portas de entrada em vez de
//   uma (CadastrosView.jsx ganhou `selecionadoInicial`) - o menu interno dela
//   continua ali, então nenhum cadastro (impostos, SPED, contatos...) ficou
//   inalcançável.
const GRUPOS = [
  {
    id: "painel", icon: "painel", labelKey: "financeiro.sidebar.grupo.painel",
    children: [
      { id: "resumo", path: "/financas/resumo", labelKey: "financeiro.sidebar.itens.resumo" },
      { id: "fluxo-caixa", path: "/financas/fluxo-caixa", labelKey: "financeiro.sidebar.itens.fluxoCaixa" },
    ],
  },
  {
    id: "transacoes", icon: "transacoes", labelKey: "financeiro.sidebar.grupo.transacoes",
    children: [
      { id: "extrato", path: "/financas/transacoes/extrato", labelKey: "financeiro.sidebar.itens.extrato" },
      { id: "receitas", path: "/financas/transacoes/receitas", labelKey: "financeiro.sidebar.itens.receitas" },
      { id: "despesas", path: "/financas/transacoes/despesas", labelKey: "financeiro.sidebar.itens.despesas" },
    ],
  },
  {
    id: "relatorios", icon: "relatorios", labelKey: "financeiro.sidebar.grupo.relatorios",
    children: [
      { id: "analise-despesas", path: "/financas/relatorios/analise-despesas", labelKey: "financeiro.sidebar.itens.analiseDespesas" },
      { id: "analise-receitas", path: "/financas/relatorios/analise-receitas", labelKey: "financeiro.sidebar.itens.analiseReceitas" },
    ],
  },
  {
    id: "configuracoes", icon: "configuracoes", labelKey: "financeiro.sidebar.grupo.configuracoes",
    children: [
      { id: "categorias", path: "/financas/configuracoes/categorias", labelKey: "financeiro.sidebar.itens.categoriasFinanceiras" },
      { id: "contas-bancarias", path: "/financas/configuracoes/contas", labelKey: "financeiro.sidebar.itens.contasBancarias" },
      { id: "centros-de-custo", path: "/financas/configuracoes/centros-de-custo", labelKey: "financeiro.sidebar.itens.centrosDeCusto" },
      { id: "outras-configuracoes", path: "/financas/configuracoes/outras", labelKey: "financeiro.sidebar.itens.outrasConfiguracoes" },
    ],
  },
];

export default function IresSidebar({ collapsed, onToggleCollapsed }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  // Grupo com o item ativo já começa aberto - senão a pessoa chegaria numa
  // sub-rota (ex.: /financas/relatorios/analise-receitas) e ela ficaria
  // escondida dentro de um grupo fechado, mesmo comportamento de
  // SaudeSidebar.jsx.
  const [grupoAberto, setGrupoAberto] = useState(() =>
    GRUPOS.filter((g) => g.children.some((c) => location.pathname.startsWith(c.path))).map((g) => g.id)
  );

  function clicarGrupo(grupo) {
    if (collapsed) return navigate(grupo.children[0].path);
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
          const grupoAtivo = grupo.children.some((c) => location.pathname.startsWith(c.path));
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
                {!collapsed && (
                  <svg className={"fin-sidebar-chevron" + (aberto ? " fin-sidebar-chevron-aberto" : "")} viewBox="0 0 24 24" width="13" height="13">
                    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </svg>
                )}
              </button>
              {!collapsed && aberto && (
                <div className="fin-sidebar-subnav">
                  {grupo.children.map((item) => (
                    <NavLink
                      key={item.id}
                      to={item.path}
                      className={({ isActive }) => "fin-sidebar-subitem" + (isActive ? " active" : "")}
                    >
                      {t(item.labelKey)}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
