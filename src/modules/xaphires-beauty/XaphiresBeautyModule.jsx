import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../state/api.js";
import AccountMenu from "../../components/AccountMenu.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";
import ModuleIcon from "../ModuleIcon.jsx";
import BeautyAgendaView from "./BeautyAgendaView.jsx";
import BeautyClientsView from "./BeautyClientsView.jsx";
import BeautyServicesView from "./BeautyServicesView.jsx";
import BeautyFinanceView from "./BeautyFinanceView.jsx";
import BeautyStaffView from "./BeautyStaffView.jsx";
import BeautyBookingLinkView from "./BeautyBookingLinkView.jsx";

// Casca do módulo com abas reais (Fases 1-4 do plano) - mesmo molde de
// CrmModule.jsx (cabeçalho + nav de abas, sem sidebar). O direito de plano
// (GET /api/plan) é buscado uma vez aqui e passado às abas que ele gate:
// financeiro/equipe (Premium+) e agendamento online (Profissional+). O
// núcleo (agenda/clientes/serviços) não depende de plano - é o produto
// vendido em todo tier, mesmo espírito do "arquivamento manual em todos os
// planos, só a automação é paga" em plans.js.
const ABAS = ["agenda", "clientes", "servicos", "financeiro", "equipe", "online"];

export default function XaphiresBeautyModule({ onExit }) {
  const { t } = useTranslation();
  const [aba, setAba] = useState("agenda");
  const [plano, setPlano] = useState(null);

  useEffect(() => {
    api.getPlan().then(setPlano).catch(() => setPlano({ canUseBeautyFinance: false, canUseBeautyOnlineBooking: false }));
  }, []);

  const canUseFinance = !!plano?.canUseBeautyFinance;
  const canUseOnlineBooking = !!plano?.canUseBeautyOnlineBooking;

  return (
    <div className="beauty-shell">
      <header className="beauty-top">
        <div className="beauty-top-left">
          <button className="icon-btn" onClick={onExit} title={t("modules.backToLauncher")} aria-label={t("modules.backToLauncher")}>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />
            </svg>
          </button>
          <span className="beauty-brand">
            <ModuleIcon name="beauty" size={20} />
            {t("modules.xaphires-beauty.name")}
          </span>
        </div>
        <div className="beauty-top-actions">
          <LanguageSwitcher />
          <AccountMenu />
        </div>
      </header>

      <nav className="crm-tabs">
        {ABAS.map((id) => {
          const bloqueada = (id === "financeiro" && !canUseFinance) || (id === "equipe" && !canUseFinance) || (id === "online" && !canUseOnlineBooking);
          return (
            <button key={id} type="button" className={"crm-tab" + (aba === id ? " active" : "")} onClick={() => setAba(id)}>
              {t(`modules.xaphiresBeauty.tabs.${id}`)}
              {bloqueada && plano && <span className="crm-tab-badge">{t(`plan.names.${id === "online" ? "professional" : "intermediate"}`)}</span>}
            </button>
          );
        })}
      </nav>

      <div className="sc-body">
        {aba === "agenda" && <BeautyAgendaView />}
        {aba === "clientes" && <BeautyClientsView />}
        {aba === "servicos" && <BeautyServicesView />}
        {aba === "financeiro" && plano && <BeautyFinanceView canUse={canUseFinance} />}
        {aba === "equipe" && plano && (canUseFinance ? <BeautyStaffView /> : <div className="sc-empty" style={{ padding: 40 }}>{t("modules.xaphiresBeauty.equipe.bloqueado", { plano: t("plan.names.intermediate") })}</div>)}
        {aba === "online" && plano && <BeautyBookingLinkView canUse={canUseOnlineBooking} />}
      </div>
    </div>
  );
}
