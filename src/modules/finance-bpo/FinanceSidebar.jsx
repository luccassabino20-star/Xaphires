import { useState } from "react";

// Ícones inline (mesmo padrão do resto do app - sem lib de ícone), um por
// item de navegação.
function IconCentral(p) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...p}>
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M4 20V10m5 10V4m5 16v-7m5 7V8" />
    </svg>
  );
}
function IconBaseDados(p) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...p}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2zm0 0v12c0 1.1 3.6 2 8 2s8-.9 8-2V6M4 12c0 1.1 3.6 2 8 2s8-.9 8-2"
      />
    </svg>
  );
}
function IconObras(p) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...p}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 21h18M5 21V7l6-4 6 4v14M9 21v-6h4v6M9 11h.01M13 11h.01M9 7h.01M13 7h.01"
      />
    </svg>
  );
}
function IconFormulas(p) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...p}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6v2m0 8v2m6-10h-2m-8 0H6m10.24-4.24-1.42 1.42M9.18 14.82l-1.42 1.42m9.06 0-1.42-1.42M9.18 9.18 7.76 7.76"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function IconChevron(p) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...p}>
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
    </svg>
  );
}
function IconConfig(p) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      />
    </svg>
  );
}

export const NAV_ITEMS = [
  { id: "central", label: "Central Executiva", sub: "Dashboard, KPIs e DRE", Icon: IconCentral },
  { id: "basedados", label: "Base de Dados", sub: "Lançamentos e notas fiscais", Icon: IconBaseDados },
  { id: "obras", label: "Obras & Contas", sub: "Centros de custo e bancos", Icon: IconObras },
  { id: "formulas", label: "Fórmulas & Métricas", sub: "EBITDA, Runway e DRE", Icon: IconFormulas },
];

// Fora de NAV_ITEMS de propósito: "escondida dentro de configurações" (pedido
// do usuário) - não é uma seção de mesmo peso que as 4 acima, é um item de
// rodapé, menor e separado por borda, no mesmo espírito do rodapé de idioma
// em ModuleLauncher.jsx. FinanceModuleLayout.jsx usa este objeto (fora do
// NAV_ITEMS.find de sempre) só pra resolver o título da topbar quando
// activeView === "config".
export const CONFIG_ITEM = { id: "config", label: "Configurações", sub: "Guia de fórmulas e regras", Icon: IconConfig };

// Sidebar interna do módulo - substitui as abas horizontais de antes (ver
// decisão registrada na conversa). Retrátil (só ícones) com o mesmo espírito
// de IresSidebar.jsx (Financeiro/ERP IRES), reimplementada aqui: este módulo
// já é autocontido (xaphiresFinance.css não entra em index.css), reaproveitar
// a sidebar de lá acoplaria os dois de um jeito que a separação de propósito
// (ver topo de FinanceModuleLayout.jsx) tenta evitar.
export default function FinanceSidebar({ ativo, onSelecionar }) {
  const [recolhida, setRecolhida] = useState(false);

  return (
    <nav className={"xf-nav" + (recolhida ? " collapsed" : "")}>
      <button
        type="button"
        className="xf-nav-toggle"
        onClick={() => setRecolhida((v) => !v)}
        title={recolhida ? "Expandir menu" : "Recolher menu"}
      >
        <IconChevron style={{ transform: recolhida ? "rotate(180deg)" : "none" }} />
      </button>
      <ul className="xf-nav-list">
        {NAV_ITEMS.map(({ id, label, sub, Icon }) => (
          <li key={id}>
            <button
              type="button"
              className={"xf-nav-item" + (ativo === id ? " active" : "")}
              onClick={() => onSelecionar(id)}
              title={recolhida ? label : undefined}
            >
              <span className="xf-nav-item-icon">
                <Icon />
              </span>
              {!recolhida && (
                <span className="xf-nav-item-text">
                  <span className="xf-nav-item-label">{label}</span>
                  <span className="xf-nav-item-sub">{sub}</span>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <ul className="xf-nav-list xf-nav-footer-list">
        <li>
          <button
            type="button"
            className={"xf-nav-item xf-nav-item-footer" + (ativo === CONFIG_ITEM.id ? " active" : "")}
            onClick={() => onSelecionar(CONFIG_ITEM.id)}
            title={recolhida ? CONFIG_ITEM.label : undefined}
          >
            <span className="xf-nav-item-icon">
              <CONFIG_ITEM.Icon />
            </span>
            {!recolhida && (
              <span className="xf-nav-item-text">
                <span className="xf-nav-item-label">{CONFIG_ITEM.label}</span>
                <span className="xf-nav-item-sub">{CONFIG_ITEM.sub}</span>
              </span>
            )}
          </button>
        </li>
      </ul>
    </nav>
  );
}
