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
import ReportsView from "./ReportsView.jsx";
import ServicosCatalogoView from "./ServicosCatalogoView.jsx";
import ServicosDesempenhoView from "./ServicosDesempenhoView.jsx";
import ServicosConveniosView from "./ServicosConveniosView.jsx";
import FinanceiroResumoView from "./FinanceiroResumoView.jsx";
import FinanceiroFluxoCaixaView from "./FinanceiroFluxoCaixaView.jsx";
import FinanceiroExtratoView from "./FinanceiroExtratoView.jsx";
import FinanceiroTransacoesView from "./FinanceiroTransacoesView.jsx";
import FinanceiroAnaliseView from "./FinanceiroAnaliseView.jsx";
import FinanceiroConfigView from "./FinanceiroConfigView.jsx";
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

  async function trocarNome(clinicName) {
    try {
      setConfig(await api.scSetClinicName(clinicName));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function trocarLogo(file) {
    try {
      setConfig(await api.scUploadClinicLogo(file));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function removerLogo() {
    try {
      setConfig(await api.scRemoverClinicLogo());
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  const isMaster = user?.role === "master";
  // "v" força o navegador a buscar a imagem de novo quando a logo é trocada -
  // sem isso, a URL fica idêntica (o path do arquivo não muda de nome) e o
  // cache do navegador continuaria mostrando a logo antiga até um F5 manual.
  const logoUrl = config?.logo_path ? `/api/saude-clinicas/config/logo?v=${config.logo_path}` : null;

  return (
    <div className="sc" data-sc-theme={config?.theme || "padrao"}>
      <header className="sc-top">
        <div className="sc-top-left">
          <button className="icon-btn" onClick={onExit} title={t("modules.backToLauncher")} aria-label={t("modules.backToLauncher")}>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />
            </svg>
          </button>
          <SaudeBrand nome={config?.clinic_name} logoUrl={logoUrl} nomeModulo={t("modules.saude-clinicas.name")} />
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
          {section === "relatorios" && <ReportsView />}
          {section === "servicos-catalogo" && <ServicosCatalogoView />}
          {section === "servicos-desempenho" && <ServicosDesempenhoView />}
          {section === "servicos-convenios" && <ServicosConveniosView />}
          {section === "financeiro-resumo" && <FinanceiroResumoView />}
          {section === "financeiro-fluxo-caixa" && <FinanceiroFluxoCaixaView />}
          {section === "financeiro-extrato" && <FinanceiroExtratoView />}
          {section === "financeiro-receitas" && <FinanceiroTransacoesView tipo="receita" />}
          {section === "financeiro-despesas" && <FinanceiroTransacoesView tipo="despesa" />}
          {section === "financeiro-analise-despesas" && <FinanceiroAnaliseView tipo="despesa" />}
          {section === "financeiro-analise-receitas" && <FinanceiroAnaliseView tipo="receita" />}
          {section === "financeiro-categorias" && <FinanceiroConfigView abaInicial="categorias" />}
          {section === "financeiro-contas" && <FinanceiroConfigView abaInicial="contas" />}
          {section === "financeiro-centros-custo" && <FinanceiroConfigView abaInicial="centros" />}
          {section === "financeiro-outras-config" && <FinanceiroConfigView abaInicial="outras" />}
          {section === "config" && config && (
            <ConfigView
              clinicType={config.clinic_type}
              theme={config.theme || "padrao"}
              clinicName={config.clinic_name || ""}
              logoUrl={logoUrl}
              isMaster={isMaster}
              onClinicTypeChange={trocarClinicType}
              onThemeChange={trocarTema}
              onNameChange={trocarNome}
              onLogoChange={trocarLogo}
              onLogoRemove={removerLogo}
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

// Marca no topo do módulo, white-label por empresa (nome e logo configurados
// em Perfil & Configurações › Dados da clínica). Logo e nome aparecem
// juntos sempre que existirem - a logo não substitui o texto, senão o
// nome que a clínica acabou de digitar "some" da tela ao enviar a imagem.
// Sem nome, só a logo (com o nome do módulo no alt). Sem nenhum dos dois,
// avatar com a inicial some junto - fallback é o nome do módulo padrão.
function SaudeBrand({ nome, logoUrl, nomeModulo }) {
  if (logoUrl) {
    return (
      <span className="sc-brand">
        <img className="sc-brand-logo" src={logoUrl} alt={nome || nomeModulo} />
        {nome && <h1 className="sc-title">{nome}</h1>}
      </span>
    );
  }
  if (nome) {
    return (
      <span className="sc-brand">
        <span className="sc-brand-avatar">{nome.charAt(0).toUpperCase()}</span>
        <h1 className="sc-title">{nome}</h1>
      </span>
    );
  }
  return <h1 className="sc-title">{nomeModulo}</h1>;
}
