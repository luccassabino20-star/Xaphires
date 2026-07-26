import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import * as api from "../state/api.js";

function formatarData(iso, locale) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" });
}

// A moeda é sempre BRL, mesmo em outro idioma: o preço é em reais e traduzir a
// moeda daria a impressão de que o valor muda com o idioma.
function formatarValor(valor, locale) {
  if (valor === null || valor === undefined) return null;
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(valor);
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

  // Contratar gera cobrança, então pede confirmação com o valor à vista — bem
  // diferente do clique-e-muda que existia antes. Passar para o gratuito não cobra
  // nada, então a pergunta é outra: não faz sentido confirmar "por R$ 0,00/mês".
  async function trocarPara(alvo) {
    const nome = t(`plan.names.${alvo.id}`);
    const pergunta = alvo.paid
      ? t("plan.upgradeConfirm", { plan: nome, price: formatarValor(alvo.price, i18n.language) })
      : t("plan.selectFreeConfirm", { plan: nome });
    if (!confirm(pergunta)) return;

    setTrocando(alvo.id);
    try {
      setPlano(await api.setPlan(alvo.id));
      showToast(t("plan.changed", { plan: nome }));
    } catch (e) {
      showToast(translateError(e, t));
    } finally {
      setTrocando(null);
    }
  }

  const dataFim = plano && formatarData(plano.expiresAt, i18n.language);
  const dataInicio = plano && formatarData(plano.contractedAt, i18n.language);
  const valor = plano && formatarValor(plano.price, i18n.language);
  // Ilimitado vira traço em vez de "null" na tela.
  const limite = plano && (plano.maxUsers === null ? t("plan.unlimited") : plano.maxUsers);
  // O servidor já decidiu o que é autoatendimento; aqui só se exibe.
  const podeEscolher = plano?.catalog?.filter((p) => p.selfSelectable) || [];
  // Sem plano pago em vigor a lista deixa de ser só "subir": entram o Básico e o
  // próprio plano atual, para renovar. O título e a dica mudam junto, senão a tela
  // continuaria dizendo "só é possível subir" embaixo de um botão de Básico.
  const planoAtual = plano?.catalog?.find((p) => p.current);
  const escolhaLivre = !!plano && (!planoAtual?.paid || plano.status === "expired");

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
                    <dt>{t("plan.monthlyLabel")}</dt>
                    <dd>{valor ?? t("plan.onRequest")}</dd>
                  </div>
                  {dataInicio && (
                    <div>
                      <dt>{t("plan.contractedAtLabel")}</dt>
                      <dd>{dataInicio}</dd>
                    </div>
                  )}
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
                  <div>
                    <dt>{t("plan.usersLabel")}</dt>
                    <dd>
                      {plano.userCount} / {limite}
                    </dd>
                  </div>
                </dl>

                {!plano.canAddUser && <p className="plan-warning">{t("plan.userLimitReached")}</p>}
              </div>

              {ehMaster ? (
                <div className="plan-switch">
                  {podeEscolher.length > 0 && (
                    <>
                      <h3>{escolhaLivre ? t("plan.selectTitle") : t("plan.upgradeTitle")}</h3>
                      <div className="plan-switch-list">
                        {podeEscolher.map((p) => (
                          <button
                            key={p.id}
                            className="plan-switch-btn"
                            onClick={() => trocarPara(p)}
                            disabled={trocando !== null}
                          >
                            <span className="plan-switch-name">{t(`plan.names.${p.id}`)}</span>
                            <span className="plan-switch-price">
                              {formatarValor(p.price, i18n.language)}
                              {t("plan.perMonth")}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="plan-switch-hint">
                    {escolhaLivre ? t("plan.freeChoiceHint") : t("plan.downgradeHint")}
                  </p>
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
