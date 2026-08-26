import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../state/api.js";
import AccountMenu from "../../components/AccountMenu.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";
import ModuleIcon from "../ModuleIcon.jsx";
import BeautyIcon from "./BeautyIcon.jsx";
import BeautyAgendaView from "./BeautyAgendaView.jsx";
import BeautyClientsView from "./BeautyClientsView.jsx";
import BeautyServicesView from "./BeautyServicesView.jsx";
import BeautyFinanceView from "./BeautyFinanceView.jsx";
import BeautyStaffView from "./BeautyStaffView.jsx";
import BeautyBookingLinkView from "./BeautyBookingLinkView.jsx";

// Sidebar fixa à esquerda (marca + voltar no topo, navegação no meio, idioma/
// conta no rodapé) no lugar da barra horizontal de abas + cabeçalho de topo
// herdados do molde do CRM - pedido de redesenho para um visual premium,
// mais alinhado ao público de estética/beleza. O direito de plano (GET
// /api/plan) é buscado uma vez aqui e passado às abas que ele gate:
// financeiro/equipe (Premium+) e agendamento online (Profissional+). O
// núcleo (agenda/clientes/serviços) não depende de plano.
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
      <div className="beauty-main">
        <aside className="beauty-sidebar">
          <div className="beauty-sidebar-top">
            <button className="beauty-sidebar-back" onClick={onExit} title={t("modules.backToLauncher")} aria-label={t("modules.backToLauncher")}>
              <svg viewBox="0 0 24 24" width="17" height="17">
                <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <span className="beauty-sidebar-brand">
              <ModuleIcon name="beauty" size={19} />
              {t("modules.xaphires-beauty.name")}
            </span>
          </div>

          <nav className="beauty-nav">
            {ABAS.map((id) => {
              const bloqueada = (id === "financeiro" && !canUseFinance) || (id === "equipe" && !canUseFinance) || (id === "online" && !canUseOnlineBooking);
              return (
                <button key={id} type="button" className={"beauty-nav-item" + (aba === id ? " active" : "")} onClick={() => setAba(id)}>
                  <BeautyIcon name={id === "online" ? "online" : id} size={17} />
                  {t(`modules.xaphiresBeauty.tabs.${id}`)}
                  {bloqueada && plano && <span className="beauty-nav-item-badge">{t(`plan.names.${id === "online" ? "professional" : "intermediate"}`)}</span>}
                </button>
              );
            })}
          </nav>

          <div className="beauty-sidebar-footer">
            <LanguageSwitcher />
            <AccountMenu />
          </div>
        </aside>

        <div className="beauty-content">
          {aba === "agenda" && <BeautyAgendaView />}
          {aba === "clientes" && <BeautyClientsView />}
          {aba === "servicos" && <BeautyServicesView />}
          {aba === "financeiro" && plano && <BeautyFinanceView canUse={canUseFinance} />}
          {aba === "equipe" && plano && <BeautyStaffView canUse={canUseFinance} />}
          {aba === "online" && plano && <BeautyBookingLinkView canUse={canUseOnlineBooking} />}
        </div>
      </div>
    </div>
  );
}
