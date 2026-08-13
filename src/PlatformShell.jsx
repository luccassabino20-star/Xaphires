import { useEffect, useState, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { getModules } from "./state/api.js";
import ModuleLauncher from "./modules/ModuleLauncher.jsx";
import AuthenticatedApp from "./AuthenticatedApp.jsx";
// Lazy: o Financeiro (com exceljs/pdf-parse na cauda) não deve pesar no pacote que
// todo cliente baixa - só é buscado quando alguém abre o módulo.
const FinanceiroModule = lazy(() => import("./modules/financeiro/FinanceiroModule.jsx"));

// A casca da plataforma: decide entre o launcher (grid de pilares) e o módulo
// aberto. Fica ABAIXO dos providers do app (Board/Users/Chat, montados em
// App.jsx) — os mesmos que já subiam no login, então trazer a casca para cá não
// muda o que é buscado nem quando. O Kanban de hoje é o módulo "vendas-crm".
//
// Fase 0: só vendas-crm abre de verdade; os outros pilares vêm do servidor como
// "Em breve" e o launcher os desenha bloqueados. Ligar um módulo novo é plugar o
// componente no mapa COMPONENTES abaixo.
const PERSIST_KEY = "xaphires-module";

// Mapa id → componente do módulo. onExit volta ao launcher. Só vendas-crm existe
// hoje; os demais entram aqui quando forem construídos, um por fase.
const COMPONENTES = {
  "vendas-crm": ({ onExit }) => <AuthenticatedApp onExitModule={onExit} />,
  financeiro: ({ onExit }) => <FinanceiroModule onExit={onExit} />,
};

export default function PlatformShell() {
  const { t } = useTranslation();
  const [modules, setModules] = useState(null); // null = ainda carregando
  const [erro, setErro] = useState(false);
  const [activeModule, setActiveModule] = useState(null);

  useEffect(() => {
    let vivo = true;
    getModules()
      .then((data) => {
        if (!vivo) return;
        setModules(data.modules);
        // Restaura o último módulo aberto, mas só se ele ainda estiver liberado —
        // um add-on que a empresa perdeu não pode reabrir sozinho no arranque.
        const salvo = localStorage.getItem(PERSIST_KEY);
        if (salvo && data.modules.some((m) => m.id === salvo && m.enabled)) {
          setActiveModule(salvo);
        }
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
    localStorage.setItem(PERSIST_KEY, id);
  }
  function voltar() {
    setActiveModule(null);
    localStorage.removeItem(PERSIST_KEY);
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
      <Suspense fallback={<div className="app-loading">{t("common.loading")}</div>}>
        <Componente onExit={voltar} />
      </Suspense>
    );
  }

  return <ModuleLauncher modules={modules} onOpen={abrir} />;
}
