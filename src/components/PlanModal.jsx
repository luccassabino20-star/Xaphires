import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import * as api from "../state/api.js";
import CheckoutModal from "./CheckoutModal.jsx";

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
  const [cobranca, setCobranca] = useState(null);
  const [erro, setErro] = useState(null);
  const [trocando, setTrocando] = useState(null);
  const [checkout, setCheckout] = useState(null); // { id, priceCents }

  const carregar = useCallback(async () => {
    try {
      const [resumo, billing] = await Promise.all([api.getPlan(), api.getBilling()]);
      setPlano(resumo);
      setCobranca(billing);
    } catch (e) {
      setErro(translateError(e, t));
    }
  }, [t]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const ehMaster = user?.role === "master";

  // Plano pago abre o checkout: o acesso só muda quando o pagamento é confirmado, e
  // por isso não há mais um "confirmar e pronto" aqui. Plano gratuito continua sendo
  // troca direta, porque não cobra nada.
  async function trocarPara(alvo) {
    if (alvo.paid) {
      setCheckout({ id: alvo.id, priceCents: Math.round((alvo.price || 0) * 100) });
      return;
    }
    const nome = t(`plan.names.${alvo.id}`);
    if (!confirm(t("plan.selectFreeConfirm", { plan: nome }))) return;

    setTrocando(alvo.id);
    try {
      setPlano(await api.setPlan(alvo.id));
      await carregar();
      showToast(t("plan.changed", { plan: nome }));
    } catch (e) {
      showToast(translateError(e, t));
    } finally {
      setTrocando(null);
    }
  }

  async function cancelarAssinatura() {
    if (!confirm(t("billing.cancelConfirm"))) return;
    try {
      await api.cancelSubscription();
      await carregar();
      showToast(t("billing.canceled"));
    } catch (e) {
      showToast(translateError(e, t));
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
  //
  // A condição espelha o canSelfSelectPlan do servidor: em vigor é só plano pago com
  // status active. Teste, carência e vencido dão escolha livre — antes esta linha
  // olhava só "expired" e a tela em teste mostrava os três planos sob o título
  // "Subir de plano", contradizendo os próprios botões.
  const planoAtual = plano?.catalog?.find((p) => p.current);
  const escolhaLivre = !!plano && !(planoAtual?.paid && plano.status === "active");

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

              {/* Cobrança em aberto vem antes de tudo: é a única coisa nesta tela que
                  exige ação e tem prazo. */}
              {cobranca?.pendingPayment && (
                <div className="plan-pending-charge">
                  <div className="plan-pending-head">
                    <span className="checkout-status-badge pending">{t("billing.awaitingPayment")}</span>
                    <strong>{formatarValor(cobranca.pendingPayment.amountCents / 100, i18n.language)}</strong>
                  </div>
                  <p>{t(`billing.methods.${cobranca.pendingPayment.method}`)}</p>
                  {ehMaster && (
                    <button
                      className="btn-primary btn-small"
                      onClick={() =>
                        setCheckout({ id: cobranca.pendingPayment.plan, priceCents: cobranca.pendingPayment.amountCents })
                      }
                    >
                      {t("billing.finishPayment")}
                    </button>
                  )}
                </div>
              )}

              {cobranca?.subscription && (
                <div className="plan-subscription">
                  <h3>{t("billing.subscriptionTitle")}</h3>
                  <dl className="plan-facts">
                    <div>
                      <dt>{t("billing.methodLabel")}</dt>
                      <dd>{t(`billing.methods.${cobranca.subscription.method}`)}</dd>
                    </div>
                    {cobranca.subscription.nextChargeAt && (
                      <div>
                        <dt>{t("billing.nextChargeLabel")}</dt>
                        <dd>{formatarData(cobranca.subscription.nextChargeAt, i18n.language)}</dd>
                      </div>
                    )}
                    <div>
                      <dt>{t("billing.subStatusLabel")}</dt>
                      <dd>{t(`billing.subStatus.${cobranca.subscription.status}`)}</dd>
                    </div>
                  </dl>
                  {ehMaster && cobranca.subscription.status !== "canceled" && (
                    <button className="btn-ghost btn-small" onClick={cancelarAssinatura}>
                      {t("billing.cancelSubscription")}
                    </button>
                  )}
                  {cobranca.subscription.status === "canceled" && (
                    <p className="plan-switch-hint">{t("billing.canceledHint")}</p>
                  )}
                </div>
              )}

              {cobranca?.payments?.length > 0 && (
                <div className="plan-history">
                  <h3>{t("billing.historyTitle")}</h3>
                  <ul className="plan-history-list">
                    {cobranca.payments.map((p) => (
                      <li key={p.id} className={"plan-history-item status-" + p.status}>
                        <span className="plan-history-date">
                          {formatarData(p.paidAt || p.createdAt, i18n.language)}
                        </span>
                        <span className="plan-history-plan">{t(`plan.names.${p.plan}`)}</span>
                        <span className="plan-history-method">{t(`billing.methods.${p.method}`)}</span>
                        <span className="plan-history-amount">
                          {formatarValor(p.amountCents / 100, i18n.language)}
                        </span>
                        <span className={"plan-history-status " + p.status}>{t(`billing.payStatus.${p.status}`)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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

      {checkout && (
        <CheckoutModal
          plan={checkout.id}
          priceCents={checkout.priceCents}
          simulated={!!cobranca?.simulated}
          docInicial={cobranca?.subscription?.payerDoc}
          onClose={() => {
            setCheckout(null);
            carregar();
          }}
          onPaid={carregar}
        />
      )}
    </div>
  );
}
