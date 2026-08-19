import { useState } from "react";
import { useTranslation } from "react-i18next";
import AccountMenu from "../../components/AccountMenu.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";
import FunilView from "./FunilView.jsx";
import ContatosView from "./ContatosView.jsx";

// Casca do CRM: cabeçalho + abas, mesmo molde simples do FinanceiroModule (a
// diferença do Saúde & Clínicas, que tem sidebar, é o tamanho - só duas telas
// reais aqui). Propostas e Pedidos já têm schema (server/modules/crm/schema.js)
// mas nenhuma tela ainda, então entram travadas na própria aba, mesmo
// tratamento de .fin-cad-item.disabled.
const ABAS = [
  { id: "funil", real: true },
  { id: "contatos", real: true },
  { id: "propostas", real: false },
  { id: "pedidos", real: false },
];

export default function CrmModule({ onExit }) {
  const { t } = useTranslation();
  const [aba, setAba] = useState("funil");

  return (
    <div className="sc">
      <header className="sc-top">
        <div className="sc-top-left">
          <button className="icon-btn" onClick={onExit} title={t("modules.backToLauncher")} aria-label={t("modules.backToLauncher")}>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />
            </svg>
          </button>
          <h1 className="sc-title">{t("modules.vendas-crm.name")}</h1>
        </div>
        <div className="sc-top-actions">
          <LanguageSwitcher />
          <AccountMenu />
        </div>
      </header>

      <nav className="crm-tabs">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={"crm-tab" + (aba === a.id ? " active" : "") + (!a.real ? " disabled" : "")}
            onClick={a.real ? () => setAba(a.id) : undefined}
            disabled={!a.real}
            title={a.real ? undefined : t("modules.comingSoon")}
          >
            {t(`crm.tabs.${a.id}`)}
            {!a.real && <span className="crm-tab-badge">{t("modules.comingSoon")}</span>}
          </button>
        ))}
      </nav>

      <div className="sc-body">
        {aba === "funil" && <FunilView />}
        {aba === "contatos" && <ContatosView />}
      </div>
    </div>
  );
}
