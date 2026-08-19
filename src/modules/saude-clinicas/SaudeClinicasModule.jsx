import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../state/AuthContext.jsx";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import AccountMenu from "../../components/AccountMenu.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";
import UsersPanel from "../../components/UsersPanel.jsx";
import TeamPanel from "../../components/TeamPanel.jsx";
import CardIcon from "./CardIcon.jsx";
import SaudeSidebar from "./SaudeSidebar.jsx";
import DashboardView from "./DashboardView.jsx";
import AgendaView from "./AgendaView.jsx";
import BlockAgendaView from "./BlockAgendaView.jsx";
import AvailabilityMatrixView from "./AvailabilityMatrixView.jsx";
import ConfigView from "./ConfigView.jsx";
import { cardsParaClinicType } from "./cardCatalog.js";
import PatientsView from "./PatientsView.jsx";
import AnamneseView from "./AnamneseView.jsx";

// Casca do módulo Saúde & Clínicas: menu lateral de administração (fixo à
// esquerda, colapsável) + conteúdo principal à direita. A seção "Pacientes" é
// quem herda a grade de cards de antes (com Pacientes/Anamnese reais e o
// resto "Em breve"); as demais seções da sidebar (Dashboard, Usuários,
// Configurações) são novas telas próprias - ver o comentário de cada uma.
export default function SaudeClinicasModule({ onExit }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const showToast = useToast();
  const [config, setConfig] = useState(null);
  const [erro, setErro] = useState("");
  const [section, setSection] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [equipeAberta, setEquipeAberta] = useState(false);

  useEffect(() => {
    api
      .scGetConfig()
      .then(setConfig)
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, []);

  async function trocarClinicType(clinicType) {
    try {
      setConfig(await api.scSetClinicType(clinicType));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function trocarTema(theme) {
    try {
      setConfig(await api.scSetTheme(theme));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  const isMaster = user?.role === "master";

  return (
    <div className="sc" data-sc-theme={config?.theme || "padrao"}>
      <header className="sc-top">
        <div className="sc-top-left">
          <button className="icon-btn" onClick={onExit} title={t("modules.backToLauncher")} aria-label={t("modules.backToLauncher")}>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />
            </svg>
          </button>
          <h1 className="sc-title">{t("modules.saude-clinicas.name")}</h1>
        </div>
        <div className="sc-top-actions">
          <LanguageSwitcher />
          <AccountMenu />
        </div>
      </header>

      <div className="sc-shell">
        <SaudeSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
          activeSection={section}
          onSelectSection={setSection}
          clinicType={config?.clinic_type}
          isMaster={isMaster}
          onClinicTypeChange={trocarClinicType}
          onAbrirEquipe={() => setEquipeAberta(true)}
        />

        <div className="sc-body">
          {erro && <div className="sc-error">{erro}</div>}
          {section === "dashboard" && <DashboardView />}
          {(section === "agenda-semana" || section === "agenda-dia") && (
            <AgendaView key={section} initialViewMode={section === "agenda-dia" ? "dia" : "semana"} />
          )}
          {section === "agenda-bloqueio" && <BlockAgendaView />}
          {section === "agenda-disponibilidade" && <AvailabilityMatrixView />}
          {section === "pacientes" && config && <PacientesSection clinicType={config.clinic_type} />}
          {section === "config" && config && (
            <ConfigView
              clinicType={config.clinic_type}
              theme={config.theme || "padrao"}
              isMaster={isMaster}
              onClinicTypeChange={trocarClinicType}
              onThemeChange={trocarTema}
            />
          )}
        </div>
      </div>

      {equipeAberta &&
        (isMaster ? <UsersPanel onClose={() => setEquipeAberta(false)} /> : <TeamPanel onClose={() => setEquipeAberta(false)} />)}
    </div>
  );
}

// Grade de cards de antes (Pacientes/Anamnese reais, resto "Em breve"),
// filtrada por especialidade - agora vivendo dentro da seção "Pacientes" da
// sidebar em vez de ser a tela inteira do módulo.
function PacientesSection({ clinicType }) {
  const { t } = useTranslation();
  const [view, setView] = useState(null); // null = grade de cards
  const cards = cardsParaClinicType(clinicType);

  if (view) {
    return (
      <div>
        <button type="button" className="btn-ghost btn-small sc-voltar-cards" onClick={() => setView(null)}>
          ← {t("saudeClinicas.voltarCards")}
        </button>
        {view === "pacientes" && <PatientsView />}
        {view === "anamnese" && <AnamneseView />}
      </div>
    );
  }

  return (
    <div className="launcher-grid">
      {cards.map((c) => (
        <button
          key={c.id}
          className={"module-card" + (c.real ? "" : " module-card-locked")}
          style={{ "--module-accent": "#101f47" }}
          onClick={c.real ? () => setView(c.view) : undefined}
          disabled={!c.real}
          title={c.real ? undefined : t("modules.comingSoon")}
        >
          <span className="module-card-icon">
            <CardIcon name={c.icon} />
          </span>
          <span className="module-card-name">{t(`saudeClinicas.cards.${c.id}.name`)}</span>
          <span className="module-card-desc">{t(`saudeClinicas.cards.${c.id}.desc`)}</span>
          <span className="module-card-footer">
            {c.real ? (
              <span className="module-card-open">
                <svg viewBox="0 0 24 24" width="15" height="15">
                  <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            ) : (
              <span className="module-card-badge">{t("modules.comingSoon")}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
