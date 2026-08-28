import { useEffect, useState, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { getModules } from "./state/api.js";
import ModuleLauncher from "./modules/ModuleLauncher.jsx";
import AuthenticatedApp from "./AuthenticatedApp.jsx";
import InstallPwaBanner from "./components/InstallPwaBanner.jsx";
// Lazy: o Financeiro (com exceljs/pdf-parse na cauda) não deve pesar no pacote que
// todo cliente baixa - só é buscado quando alguém abre o módulo.
const FinanceiroModule = lazy(() => import("./modules/financeiro/FinanceiroModule.jsx"));
// Idem, para o módulo Saúde & Clínicas.
const SaudeClinicasModule = lazy(() => import("./modules/saude-clinicas/SaudeClinicasModule.jsx"));
// Idem, para o CRM (o "vendas-crm" de verdade, separado do quadro genérico).
const CrmModule = lazy(() => import("./modules/crm/CrmModule.jsx"));
// Idem, para o Xaphires Beauty.
const XaphiresBeautyModule = lazy(() => import("./modules/xaphires-beauty/XaphiresBeautyModule.jsx"));
// Idem, para o Time & Tracking.
const TimeTrackingModule = lazy(() => import("./modules/time-tracking/TimeTrackingModule.jsx"));
// Idem, para o Finance & BPO.
const FinanceModuleLayout = lazy(() => import("./modules/finance-bpo/FinanceModuleLayout.jsx"));

// A casca da plataforma: decide entre o launcher (grid de pilares) e o módulo
// aberto. Fica ABAIXO dos providers do app (Board/Users/Chat, montados em
// App.jsx) — os mesmos que já subiam no login, então trazer a casca para cá não
// muda o que é buscado nem quando.
//
// "vendas-crm" nasceu como apelido do quadro genérico (Fase 0); virou dois
// módulos quando o CRM ganhou schema próprio: "quadro" continua sendo o
// Kanban de sempre (AuthenticatedApp), e "vendas-crm" passou a ser o CRM de
// verdade. Ver server/modules.js e a migração em directory.js
// (migrarIdModuloQuadro) para quem já tinha entitlement explícito do id antigo.

// Mapa id → componente do módulo. onExit volta ao launcher. Ligar um módulo
// novo é plugar o componente aqui.
const COMPONENTES = {
  quadro: ({ onExit }) => <AuthenticatedApp onExitModule={onExit} />,
  "vendas-crm": ({ onExit }) => <CrmModule onExit={onExit} />,
  financeiro: ({ onExit }) => <FinanceiroModule onExit={onExit} />,
  "finance-bpo": ({ onExit }) => <FinanceModuleLayout onExit={onExit} />,
  "saude-clinicas": ({ onExit }) => <SaudeClinicasModule onExit={onExit} />,
  "xaphires-beauty": ({ onExit }) => <XaphiresBeautyModule onExit={onExit} />,
  "time-tracking": ({ onExit }) => <TimeTrackingModule onExit={onExit} />,
};

export default function PlatformShell() {
  const { t } = useTranslation();
  const [modules, setModules] = useState(null); // null = ainda carregando
  const [erro, setErro] = useState(false);
  // Sem persistência de propósito: o painel de módulos é a tela que recebe
  // quem loga (ou recarrega a página logado), sempre — nunca pula direto para
  // o último módulo aberto.
  const [activeModule, setActiveModule] = useState(null);

  useEffect(() => {
    let vivo = true;
    getModules()
      .then((data) => {
        if (!vivo) return;
        setModules(data.modules);
      })
      .catch(() => {
        if (vivo) setErro(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  function abrir(id) {
    setActiveModule(id);
  }
  function voltar() {
    setActiveModule(null);
  }

  if (erro) {
    return (
      <div className="launcher-error">
        <p>{t("modules.loadError")}</p>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          {t("common.retry")}
        </button>
      </div>
    );
  }
  if (modules === null) {
    return <div className="app-loading">{t("common.loading")}</div>;
  }

  // Só abre um módulo liberado e com componente plugado — guarda contra um
  // localStorage adulterado ou um id de fase futura sem tela ainda.
  const ativo = modules.find((m) => m.id === activeModule && m.enabled);
  const Componente = ativo ? COMPONENTES[ativo.id] : null;
  if (ativo && Componente) {
    // Suspense cobre o carregamento do chunk lazy do módulo (Financeiro).
    return (
      <>
        <Suspense fallback={<div className="app-loading">{t("common.loading")}</div>}>
          <Componente onExit={voltar} />
        </Suspense>
        <InstallPwaBanner />
      </>
    );
  }

  return (
    <>
      <ModuleLauncher modules={modules} onOpen={abrir} />
      <InstallPwaBanner />
    </>
  );
}
