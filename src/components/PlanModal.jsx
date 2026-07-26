import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import * as api from "../state/api.js";

const ORDEM = ["basic", "intermediate", "professional", "enterprise"];

function formatarData(iso, locale) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" });
}

export default function PlanModal({ onClose }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const showToast = useToast();
  const [plano, setPlano] = useState(null);
  const [erro, setErro] = useState(null);
  const [trocando, setTrocando] = useState(null);

  useEffect(() => {
    api
      .getPlan()
      .then(setPlano)
      .catch((e) => setErro(translateError(e, t)));
  }, [t]);

  const ehMaster = user?.role === "master";

  async function trocarPara(id) {
    setTrocando(id);
    try {
      setPlano(await api.setPlan(id));
      showToast(t("plan.changed", { plan: t(`plan.names.${id}`) }));
    } catch (e) {
      showToast(translateError(e, t));
    } finally {
      setTrocando(null);
    }
  }

  const dataFim = plano && formatarData(plano.expiresAt, i18n.language);
  // Ilimitado vira traço em vez de "null" na tela.
  const limite = plano && (plano.maxUsers === null ? t("plan.unlimited") : plano.maxUsers);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal plan-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>
        <div className="modal-header">
          <h2 className="plan-modal-title">{t("plan.title")}</h2>
        </div>

        <div className="modal-body">
          {erro && <div className="auth-error">{erro}</div>}
          {!plano && !erro && <p className="plan-modal-loading">{t("common.loading")}</p>}

          {plano && (
            <>
              <div className="plan-current">
                <div className="plan-current-name">
                  {t(`plan.names.${plano.plan}`)}
                  <span className={"plan-status plan-status-" + plano.status}>
                    {t(`plan.status.${plano.status}`)}
                  </span>
                </div>

                <dl className="plan-facts">
                  <div>
                    <dt>{t("plan.usersLabel")}</dt>
                    <dd>
                      {plano.userCount} / {limite}
                    </dd>
                  </div>
                  {dataFim && (
                    <div>
                      <dt>
                        {plano.status === "expired" ? t("plan.expiredOnLabel") : t("plan.renewsOnLabel")}
                      </dt>
                      <dd>{dataFim}</dd>
                    </div>
                  )}
                  {plano.daysLeft !== null && plano.daysLeft > 0 && (
                    <div>
                      <dt>{t("plan.daysLeftLabel")}</dt>
                      <dd>{t("plan.daysLeftValue", { count: plano.daysLeft })}</dd>
                    </div>
                  )}
                </dl>

                {!plano.canAddUser && <p className="plan-warning">{t("plan.userLimitReached")}</p>}
              </div>

              {ehMaster ? (
                <div className="plan-switch">
                  <h3>{t("plan.changeTitle")}</h3>
                  <div className="plan-switch-list">
                    {ORDEM.map((id) => (
                      <button
                        key={id}
                        className={"plan-switch-btn" + (id === plano.plan ? " active" : "")}
                        onClick={() => trocarPara(id)}
                        disabled={id === plano.plan || trocando !== null}
                      >
                        {t(`plan.names.${id}`)}
                      </button>
                    ))}
                  </div>
                  <p className="plan-switch-hint">{t("plan.changeHint")}</p>
                </div>
              ) : (
                <p className="plan-switch-hint">{t("plan.masterOnly")}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
