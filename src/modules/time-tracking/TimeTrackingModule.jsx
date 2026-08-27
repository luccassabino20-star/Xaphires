import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../state/AuthContext.jsx";
import AccountMenu from "../../components/AccountMenu.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";
import ModuleIcon from "../ModuleIcon.jsx";
import MyTimesheetView from "./MyTimesheetView.jsx";
import AllTimesheetsView from "./AllTimesheetsView.jsx";
import ApprovalsView from "./ApprovalsView.jsx";

// Casca do Time & Tracking: cabeçalho com abas (não sidebar lateral - pedido
// explícito do cliente foi navegação por abas no topo, diferente do molde
// de sidebar que Beauty/Financeiro/Saúde usam). "Todos os apontamentos" e
// "Aprovações" só aparecem pro master - decisão do time (aprovar é ação
// gerencial), mesmo espírito de módulos restritos por papel no resto do app.
export default function TimeTrackingModule({ onExit }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [aba, setAba] = useState("meus");
  const ehMaster = user?.role === "master";

  return (
    <div className="tt-shell">
      <header className="tt-header">
        <div className="tt-header-left">
          <button type="button" className="tt-back" onClick={onExit} title={t("modules.backToLauncher")} aria-label={t("modules.backToLauncher")}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="tt-brand-icon"><ModuleIcon name="tempo" size={20} /></span>
          <h1 className="tt-title">{t("modules.time-tracking.name")}</h1>
        </div>

        <nav className="tt-tabs">
          <button type="button" className={"tt-tab" + (aba === "meus" ? " active" : "")} onClick={() => setAba("meus")}>
            {t("modules.timeTracking.tabs.meus")}
          </button>
          {ehMaster && (
            <button type="button" className={"tt-tab" + (aba === "todos" ? " active" : "")} onClick={() => setAba("todos")}>
              {t("modules.timeTracking.tabs.todos")}
            </button>
          )}
          {ehMaster && (
            <button type="button" className={"tt-tab" + (aba === "aprovacoes" ? " active" : "")} onClick={() => setAba("aprovacoes")}>
              {t("modules.timeTracking.tabs.aprovacoes")}
            </button>
          )}
        </nav>

        <div className="tt-header-right">
          <LanguageSwitcher />
          <AccountMenu />
        </div>
      </header>

      <div className="tt-body">
        {aba === "meus" && <MyTimesheetView />}
        {aba === "todos" && ehMaster && <AllTimesheetsView />}
        {aba === "aprovacoes" && ehMaster && <ApprovalsView />}
      </div>
    </div>
  );
}
