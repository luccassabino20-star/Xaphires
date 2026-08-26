import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import AccountMenu from "../../components/AccountMenu.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";
import ModuleIcon from "../ModuleIcon.jsx";

// Casca do módulo Xaphires Beauty (Fase 0 do plano) - mesma estrutura de
// cabeçalho de SaudeClinicasModule.jsx (botão de voltar + marca + idioma/
// conta), mas sem sidebar/seções ainda: não há CRUD real por trás até a
// Fase 1 (clientes/serviços/agenda). O resumo que aparece abaixo vem da
// rota real (GET /api/xaphires-beauty/config -> repo.js -> tabelas
// criadas em schema.js), só pra provar que o caminho inteiro (banco ->
// rota -> tela) já funciona - não é dado de mentira.
export default function XaphiresBeautyModule({ onExit }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let vivo = true;
    api
      .xbGetConfig()
      .then((data) => vivo && setSummary(data))
      .catch((err) => showToast(translateError(err, t)));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line
  }, []);

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

      <div className="beauty-empty">
        <ModuleIcon name="beauty" size={40} />
        <h2>{t("modules.xaphiresBeauty.comingSoonTitle")}</h2>
        <p>{t("modules.xaphiresBeauty.comingSoonText")}</p>
        {summary && (
          <div className="beauty-empty-stats">
            <span>{t("modules.xaphiresBeauty.statClients", { count: summary.clients })}</span>
            <span>{t("modules.xaphiresBeauty.statServices", { count: summary.services })}</span>
            <span>{t("modules.xaphiresBeauty.statAppointments", { count: summary.appointments })}</span>
          </div>
        )}
      </div>
    </div>
  );
}
