import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../state/api.js";
import { useAuth } from "../../state/AuthContext.jsx";
import { useToast } from "../../state/ToastContext.jsx";
import AccountMenu from "../../components/AccountMenu.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";
import Avatar from "../../components/Avatar.jsx";
import ModuleIcon from "../ModuleIcon.jsx";
import BeautyIcon from "./BeautyIcon.jsx";
import BeautyAgendaView from "./BeautyAgendaView.jsx";
import BeautyClientsView from "./BeautyClientsView.jsx";
import BeautyServicesView from "./BeautyServicesView.jsx";
import BeautyFinanceView from "./BeautyFinanceView.jsx";
import BeautyStaffView from "./BeautyStaffView.jsx";
import BeautyBookingLinkView from "./BeautyBookingLinkView.jsx";
import BeautyOverviewView from "./BeautyOverviewView.jsx";
import BeautyBlocksView from "./BeautyBlocksView.jsx";
import BeautyBirthdaysView from "./BeautyBirthdaysView.jsx";
import BeautyComingSoonView from "./BeautyComingSoonView.jsx";

// Sidebar fixa à esquerda no lugar da barra horizontal de abas + cabeçalho
// de topo herdados do molde do CRM. Redesenho pedido pelo cliente
// (referência de imagem): banner de notificação no topo do conteúdo, card
// de perfil retrátil, e o menu agrupado em três blocos - o item principal
// (Agendamentos) fora de grupo, e os demais em VISÃO GERAL/OPERAÇÃO/
// FINANCEIRO-CONFIG. Alguns itens do pedido (Fichas de anamnese, Despesas,
// Minha assinatura, Configurações) ainda não têm tela própria - aparecem
// como "Em breve" (BeautyComingSoonView), não como link morto. Os itens que
// JÁ existiam antes deste redesenho (Financeiro, Equipe, Agendamento
// online) foram mantidos dentro do grupo Financeiro/Config, mesmo não
// estando na lista original do pedido - removê-los do menu tornaria essas
// telas (já testadas e em produção) inacessíveis.
const ITEM_PRINCIPAL = { id: "agenda", icon: "agenda", tKey: "agendamentos" };
const GRUPOS = [
  {
    labelKey: "visaoGeral",
    itens: [
      { id: "visao-geral", icon: "visao-geral", tKey: "visaoGeral" },
      { id: "cadastros", icon: "clientes", tKey: "cadastros" },
    ],
  },
  {
    labelKey: "operacao",
    itens: [
      { id: "catalogo", icon: "servicos", tKey: "catalogo" },
      { id: "bloqueio-horarios", icon: "bloqueio", tKey: "bloqueioHorarios" },
      { id: "fichas-anamnese", icon: "anamnese", tKey: "fichasAnamnese" },
      { id: "aniversariantes", icon: "aniversariantes", tKey: "aniversariantes" },
    ],
  },
  {
    labelKey: "financeiroConfig",
    itens: [
      { id: "financeiro", icon: "financeiro", tKey: "financeiro", gate: "finance" },
      { id: "despesas", icon: "despesas", tKey: "despesas" },
      { id: "equipe", icon: "equipe", tKey: "equipe", gate: "finance" },
      { id: "minha-assinatura", icon: "assinatura", tKey: "minhaAssinatura" },
      { id: "online", icon: "online", tKey: "online", gate: "online" },
      { id: "configuracoes", icon: "configuracoes", tKey: "configuracoes" },
    ],
  },
];

export default function XaphiresBeautyModule({ onExit }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const showToast = useToast();
  const [aba, setAba] = useState("agenda");
  const [plano, setPlano] = useState(null);
  const [bannerVisivel, setBannerVisivel] = useState(true);
  const [perfilAberto, setPerfilAberto] = useState(false);

  useEffect(() => {
    api.getPlan().then(setPlano).catch(() => setPlano({ canUseBeautyFinance: false, canUseBeautyOnlineBooking: false }));
  }, []);

  const canUseFinance = !!plano?.canUseBeautyFinance;
  const canUseOnlineBooking = !!plano?.canUseBeautyOnlineBooking;
  function podeUsar(gate) {
    if (gate === "finance") return canUseFinance;
    if (gate === "online") return canUseOnlineBooking;
    return true;
  }

  async function ativarNotificacoes() {
    if (!("Notification" in window)) {
      showToast(t("modules.xaphiresBeauty.banner.semSuporte"));
      return;
    }
    const permissao = await Notification.requestPermission();
    showToast(t(permissao === "granted" ? "modules.xaphiresBeauty.banner.ativado" : "modules.xaphiresBeauty.banner.recusado"));
    setBannerVisivel(false);
  }

  function renderItem({ id, icon, tKey, gate }) {
    const bloqueada = gate && plano && !podeUsar(gate);
    return (
      <button key={id} type="button" className={"beauty-nav-item" + (aba === id ? " active" : "")} onClick={() => setAba(id)}>
        <BeautyIcon name={icon} size={17} />
        {t(`modules.xaphiresBeauty.tabs.${tKey}`)}
        {bloqueada && <span className="beauty-nav-item-badge">{t(`plan.names.${gate === "online" ? "professional" : "intermediate"}`)}</span>}
      </button>
    );
  }

  return (
    <div className="beauty-shell">
      {bannerVisivel && (
        <div className="beauty-banner">
          <span className="beauty-banner-texto">🔔 {t("modules.xaphiresBeauty.banner.texto")}</span>
          <div className="beauty-banner-acoes">
            <button type="button" className="beauty-banner-ativar" onClick={ativarNotificacoes}>{t("modules.xaphiresBeauty.banner.ativar")}</button>
            <button type="button" className="beauty-banner-fechar" aria-label={t("common.close")} onClick={() => setBannerVisivel(false)}>
              <svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>
      )}

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

          <div className="beauty-profile-card" onClick={() => setPerfilAberto((v) => !v)}>
            <Avatar id={user?.id} name={user?.name} avatarUrl={user?.avatarUrl} />
            <div className="beauty-profile-card-info">
              <div className="beauty-profile-card-nome">{user?.name}</div>
              <div className="beauty-profile-card-papel">{t(user?.role === "master" ? "modules.xaphiresBeauty.perfil.proprietario" : "modules.xaphiresBeauty.perfil.equipe")}</div>
            </div>
            <svg className={"beauty-profile-card-chevron" + (perfilAberto ? " aberto" : "")} viewBox="0 0 24 24" width="14" height="14">
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </div>
          {perfilAberto && <div className="beauty-profile-card-extra">{user?.email}</div>}

          <nav className="beauty-nav">
            {renderItem(ITEM_PRINCIPAL)}
            {GRUPOS.map((grupo) => (
              <div key={grupo.labelKey}>
                <div className="beauty-nav-group-label">{t(`modules.xaphiresBeauty.grupos.${grupo.labelKey}`)}</div>
                {grupo.itens.map(renderItem)}
              </div>
            ))}
          </nav>

          <div className="beauty-sidebar-footer">
            <LanguageSwitcher />
            <AccountMenu />
          </div>
        </aside>

        <div className="beauty-content">
          {aba === "agenda" && <BeautyAgendaView />}
          {aba === "visao-geral" && <BeautyOverviewView />}
          {aba === "cadastros" && <BeautyClientsView />}
          {aba === "catalogo" && <BeautyServicesView />}
          {aba === "bloqueio-horarios" && <BeautyBlocksView />}
          {aba === "fichas-anamnese" && <BeautyComingSoonView titleKey="modules.xaphiresBeauty.tabs.fichasAnamnese" />}
          {aba === "aniversariantes" && <BeautyBirthdaysView />}
          {aba === "financeiro" && plano && <BeautyFinanceView canUse={canUseFinance} />}
          {aba === "despesas" && <BeautyComingSoonView titleKey="modules.xaphiresBeauty.tabs.despesas" />}
          {aba === "equipe" && plano && <BeautyStaffView canUse={canUseFinance} />}
          {aba === "minha-assinatura" && <BeautyComingSoonView titleKey="modules.xaphiresBeauty.tabs.minhaAssinatura" />}
          {aba === "online" && plano && <BeautyBookingLinkView canUse={canUseOnlineBooking} />}
          {aba === "configuracoes" && <BeautyComingSoonView titleKey="modules.xaphiresBeauty.tabs.configuracoes" />}
        </div>
      </div>
    </div>
  );
}
