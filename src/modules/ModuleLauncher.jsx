import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import AccountMenu from "../components/AccountMenu.jsx";
import LanguageSwitcher from "../components/LanguageSwitcher.jsx";
import ModuleIcon from "./ModuleIcon.jsx";
import { metaFor } from "./registry.js";

// Home da plataforma: um card por pilar. Módulo liberado (enabled) abre; módulo
// só de vitrine mostra "Em breve" e não é clicável. A decisão de enabled vem
// pronta do servidor (server/modules.js) — aqui só se desenha o que veio.
export default function ModuleLauncher({ modules, onOpen }) {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="launcher">
      {/* Brilho decorativo do fundo - dois halos suaves nas cores da marca, puro
          enfeite, por isso aria-hidden e sem interação. */}
      <div className="launcher-glow" aria-hidden="true" />

      <header className="launcher-top">
        <div className="launcher-brand">Xaphires</div>
        <div className="launcher-top-actions">
          <LanguageSwitcher />
          <AccountMenu />
        </div>
      </header>

      <div className="launcher-body">
        <span className="launcher-eyebrow">{t("modules.launcher.eyebrow")}</span>
        <h1 className="launcher-title">{t("modules.launcher.title", { name: user?.name || "" })}</h1>
        <p className="launcher-subtitle">{t("modules.launcher.subtitle")}</p>

        <div className="launcher-grid">
          {modules.map((m) => {
            const meta = metaFor(m.id);
            const clickable = m.enabled;
            return (
              <button
                key={m.id}
                className={"module-card" + (clickable ? "" : " module-card-locked")}
                style={{ "--module-accent": meta.accent }}
                onClick={clickable ? () => onOpen(m.id) : undefined}
                disabled={!clickable}
                title={clickable ? undefined : t("modules.comingSoon")}
              >
                <span className="module-card-glow" aria-hidden="true" />
                <span className="module-card-icon">
                  <ModuleIcon name={meta.icon} />
                </span>
                <span className="module-card-name">{t(meta.labelKey)}</span>
                <span className="module-card-desc">{t(meta.descKey)}</span>
                {clickable ? (
                  <span className="module-card-arrow" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18">
                      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                ) : (
                  <span className="module-card-badge">{t("modules.comingSoon")}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
