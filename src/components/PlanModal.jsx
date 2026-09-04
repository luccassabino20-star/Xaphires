import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import * as api from "../state/api.js";
import ModuleIcon from "../modules/ModuleIcon.jsx";
import { metaFor } from "../modules/registry.js";
import CheckoutModal from "./CheckoutModal.jsx";
import PlanStepper from "./PlanStepper.jsx";

function formatarMoeda(cents, locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(cents / 100);
}

// Toggle visual (trilho + bolinha) por cima de um checkbox de verdade - o
// checkbox continua controlando estado/acessibilidade (foco, leitor de tela,
// clique em qualquer parte do <label> que o envolve), o CSS só desenha por
// cima. Mesmo padrão do resto do design system: sem componente de terceiro.
function AddonToggle({ checked, onChange }) {
  return (
    <span className="addon-toggle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="addon-toggle-track">
        <span className="addon-toggle-thumb" />
      </span>
    </span>
  );
}

// Passo intermediário entre "escolher plano" e "pagar", só para planos com
// vaga de módulo LIMITADA (Starter/Growth - maxModules é um número). Full
// Suite/Enterprise (maxModules null) não passam por aqui: pedem todos os
// módulos não-core disponíveis de uma vez (ver trocarPara), porque não há o
// que escolher quando o plano já entitla a tudo. A concessão de verdade
// continua manual pelo painel admin de qualquer forma (ver comentário em
// server/billing/lifecycle.js confirmarPagamento) - isto aqui só registra o
// pedido e monta o valor certo pro checkout.
function ModulePickerStep({ alvo, addonCatalog, onCancel, onContinue }) {
  const { t, i18n } = useTranslation();
  const [modulos, setModulos] = useState(null); // catálogo cru de GET /api/modules
  const [erro, setErro] = useState("");
  const [escolhidos, setEscolhidos] = useState([]);
  const [addonsEscolhidos, setAddonsEscolhidos] = useState([]);

  useEffect(() => {
    api.getModules().then((r) => setModulos(r.modules)).catch((e) => setErro(translateError(e, t)));
  }, [t]);

  const opcoes = (modulos || []).filter((m) => m.available && !m.core);
  const noLimite = escolhidos.length >= alvo.maxModules;

  function alternarModulo(id) {
    setEscolhidos((atual) => {
      if (atual.includes(id)) {
        // Tirar o módulo tira junto os add-ons dele - não faz sentido cobrar
        // add-on de um módulo que não foi mais selecionado.
        setAddonsEscolhidos((as) => as.filter((aid) => addonCatalog.find((a) => a.id === aid)?.moduleId !== id));
        return atual.filter((x) => x !== id);
      }
      if (atual.length >= alvo.maxModules) return atual;
      return [...atual, id];
    });
  }

  function alternarAddon(id) {
    setAddonsEscolhidos((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  const addonsDisponiveis = addonCatalog.filter((a) => escolhidos.includes(a.moduleId));
  const totalAddonsCents = addonsDisponiveis
    .filter((a) => addonsEscolhidos.includes(a.id))
    .reduce((soma, a) => soma + a.priceCents, 0);
  const precoBaseCents = Math.round((alvo.price || 0) * 100);
  const totalCents = precoBaseCents + totalAddonsCents;
  const addonsAtivos = addonsDisponiveis.filter((a) => addonsEscolhidos.includes(a.id));
  // Sugestão de upgrade no aviso de limite: o próximo degrau de vaga de módulo
  // acima do plano atual (Starter->Growth->Full Suite) - nunca o próprio plano
  // sendo configurado, senão o aviso soaria "faça upgrade pro que você já tem".
  const proximoTier = alvo.id === "starter" ? "growth" : "fullsuite";

  return (
    <div className="premium-flow-root">
      <div className="premium-modal-header">
        <span className="premium-badge">{t(`plan.names.${alvo.id}`)}</span>
        <h2 className="premium-modal-title">{t("plan.modulePicker.title")}</h2>
        <p className="premium-modal-subtitle">
          {t("plan.modulePicker.hint", { count: alvo.maxModules, plan: t(`plan.names.${alvo.id}`) })}
        </p>
        <PlanStepper current={2} />
      </div>

      <div className="premium-body">
      <div className="module-picker-scroll">
        {erro && <div className="auth-error">{erro}</div>}
        {!modulos && !erro && <p className="plan-modal-loading">{t("common.loading")}</p>}

        {modulos && (
          <div className="module-picker-cards">
            {opcoes.map((m) => {
              const meta = metaFor(m.id);
              const marcado = escolhidos.includes(m.id);
              const bloqueado = !marcado && noLimite;
              const addonsDoModulo = addonCatalog.filter((a) => a.moduleId === m.id);
              return (
                <div className={"module-card" + (marcado ? " selected" : "") + (bloqueado ? " locked" : "")} key={m.id}>
                  <button
                    type="button"
                    className="module-card-main"
                    onClick={() => alternarModulo(m.id)}
                    disabled={bloqueado}
                    aria-pressed={marcado}
                  >
                    <span className="module-card-icon">
                      <ModuleIcon name={meta.icon} size={22} />
                    </span>
                    <span className="module-card-text">
                      <span className="module-card-title">{t(meta.labelKey)}</span>
                      <span className="module-card-desc">{t(meta.descKey)}</span>
                    </span>
                    {bloqueado ? (
                      <span className="module-card-lock-badge">{t("plan.modulePicker.limitBadge")}</span>
                    ) : (
                      <span className={"module-card-check" + (marcado ? " on" : "")} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="13" height="13">
                          <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 5 5L19 7" />
                        </svg>
                      </span>
                    )}
                  </button>

                  {/* Sempre montado (nunca condicionado a `marcado`) para o grid-template-rows
                      poder animar de 0fr pra 1fr em vez de só aparecer/sumir - é o "desliza
                      suavemente" pedido, sem JS medindo altura. */}
                  {addonsDoModulo.length > 0 && (
                    <div className={"module-card-addons" + (marcado ? " expanded" : "")}>
                      <div className="module-card-addons-inner">
                        {addonsDoModulo.map((a) => (
                          <label className="addon-row" key={a.id}>
                            <span className="addon-row-text">
                              <span className="addon-row-name">{t(a.labelKey)}</span>
                              <span className="addon-row-price">+{formatarMoeda(a.priceCents, i18n.language)}/mês</span>
                            </span>
                            <AddonToggle checked={addonsEscolhidos.includes(a.id)} onChange={() => alternarAddon(a.id)} />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {noLimite && (
          <div className="module-picker-upsell">
            <span className="module-picker-upsell-text">
              {t("plan.modulePicker.limitHint", { plan: t(`plan.names.${proximoTier}`) })}
            </span>
          </div>
        )}
      </div>

      <div className="premium-summary-panel">
        <span className="premium-summary-eyebrow">{t("plan.modulePicker.totalLabel")}</span>
        <strong className="premium-summary-total-value" key={totalCents}>
          {formatarMoeda(totalCents, i18n.language)}
        </strong>

        <div className="premium-summary-lines">
          <div className="premium-summary-line">
            <span>{t(`plan.names.${alvo.id}`)}</span>
            <span>{formatarMoeda(precoBaseCents, i18n.language)}</span>
          </div>
          {addonsAtivos.map((a) => (
            <div className="premium-summary-line addon" key={a.id}>
              <span>{t(a.labelKey)}</span>
              <span>+{formatarMoeda(a.priceCents, i18n.language)}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="premium-cta"
          disabled={escolhidos.length === 0}
          onClick={() => onContinue(escolhidos, addonsEscolhidos, precoBaseCents + totalAddonsCents)}
        >
          {t("plan.modulePicker.continue")}
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <button type="button" className="premium-cancel-link" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
      </div>
    </div>
  );
}

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

// Ícones de linha do card de status - mesmo estilo (stroke, sem preenchimento)
// dos SVGs já usados no fluxo premium (PlanStepper, module-card-check), para
// não introduzir lib de ícone nova só para este dashboard.
function IconWallet({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M3.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14.6 12.2h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconCalendar({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconUsers({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="9" cy="8.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15.3 6.3a3 3 0 0 1 0 5.7M18.5 19c0-2.4-1.6-4.3-3.7-4.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconInfo({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="8.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v5.3M12 8.2v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// Subtexto do card de plano na grade de troca - null é "sem teto" (Full Suite/
// Enterprise entitlam a todos os módulos não-core de uma vez, ver trocarPara),
// 0 é o Free (só o Kanban, que é core e nem entra na conta de maxModules).
function moduleCapLabel(p, t) {
  if (p.maxModules === null) return t("plan.cardModules.all");
  if (p.maxModules === 0) return t("plan.cardModules.none");
  return t("plan.cardModules.count", { count: p.maxModules });
}

export default function PlanModal({ onClose }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const showToast = useToast();
  const [plano, setPlano] = useState(null);
  const [cobranca, setCobranca] = useState(null);
  const [erro, setErro] = useState(null);
  const [trocando, setTrocando] = useState(null);
  const [checkout, setCheckout] = useState(null); // { id, priceCents, modules, addons }
  const [escolhaModulos, setEscolhaModulos] = useState(null); // plano-alvo aguardando o picker

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
      // maxModules é um número (Starter/Growth): a pessoa escolhe QUAIS módulos,
      // dentro da vaga do plano - passa pelo picker antes do checkout. null
      // (Full Suite/Enterprise) não tem o que escolher - o plano já entitla a
      // todos, então o pedido de módulo vai com a lista inteira de uma vez,
      // sem perguntar (a concessão de verdade continua manual pelo painel
      // admin de qualquer forma - ver comentário em confirmarPagamento).
      if (alvo.maxModules === null) {
        let todos = [];
        try {
          const r = await api.getModules();
          todos = r.modules.filter((m) => m.available && !m.core).map((m) => m.id);
        } catch {
          /* sem catálogo, segue sem módulo pedido - checkout continua válido */
        }
        setCheckout({ id: alvo.id, priceCents: Math.round((alvo.price || 0) * 100), modules: todos, addons: [] });
        return;
      }
      if (alvo.maxModules > 0) {
        setEscolhaModulos(alvo);
        return;
      }
      setCheckout({ id: alvo.id, priceCents: Math.round((alvo.price || 0) * 100), modules: [], addons: [] });
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

  // Barra de progresso da validade: proporção calculada a partir das próprias
  // datas que a tela já mostra (contratado em / válido até), não de uma
  // constante de dias de teste/carência duplicada do servidor (TRIAL_DAYS/
  // GRACE_DAYS vivem só em server/plans.js e server/billing/lifecycle.js) -
  // assim funciona igual para teste, carência e ciclo mensal pago, sem o
  // cliente reimplementar regra nenhuma.
  const diasTotaisPeriodo =
    plano && plano.contractedAt && plano.expiresAt
      ? Math.max(1, Math.round((new Date(plano.expiresAt) - new Date(plano.contractedAt)) / 86400000))
      : null;
  const progressoValidade =
    plano && diasTotaisPeriodo && plano.daysLeft !== null
      ? Math.max(0, Math.min(100, (plano.daysLeft / diasTotaisPeriodo) * 100))
      : null;
  const progressoUsuarios =
    plano && plano.maxUsers !== null ? Math.max(0, Math.min(100, (plano.userCount / plano.maxUsers) * 100)) : null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={
          "modal plan-modal premium-modal " + (escolhaModulos ? "module-picker-modal" : "plan-overview-modal")
        }
      >
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>
        {/* Em modo picker o header é o premium-modal-header (badge + título +
            stepper) desenhado dentro de ModulePickerStep - este aqui duplicaria
            o topo do modal por cima dele. */}
        {!escolhaModulos && (
          <div className="premium-modal-header">
            <h2 className="premium-modal-title">{t("plan.title")}</h2>
            <p className="premium-modal-subtitle">{t("plan.subtitle")}</p>
          </div>
        )}

        {escolhaModulos ? (
          <ModulePickerStep
            alvo={escolhaModulos}
            addonCatalog={plano?.addonCatalog || []}
            onCancel={() => setEscolhaModulos(null)}
            onContinue={(modules, addons, totalCents) => {
              setCheckout({ id: escolhaModulos.id, priceCents: totalCents, modules, addons });
              setEscolhaModulos(null);
            }}
          />
        ) : (
        <div className="modal-body plan-overview-body">
          {erro && <div className="auth-error">{erro}</div>}
          {!plano && !erro && <p className="plan-modal-loading">{t("common.loading")}</p>}

          {plano && (
            <>
              <div className="plan-hero-card">
                <div className="plan-hero-top">
                  <span className="plan-hero-identity">
                    <span className="plan-hero-name">{t(`plan.names.${plano.plan}`)}</span>
                    {dataInicio && (
                      <span className="plan-hero-since">
                        {t("plan.contractedAtLabel")} {dataInicio}
                      </span>
                    )}
                  </span>
                  <span className={"plan-status-pill status-" + plano.status}>
                    <span className="plan-status-pill-dot" aria-hidden="true" />
                    {t(`plan.status.${plano.status}`)}
                  </span>
                </div>

                <div className="plan-hero-metrics">
                  <div className="plan-metric">
                    <span className="plan-metric-label">
                      <IconWallet />
                      {t("plan.monthlyLabel")}
                    </span>
                    <span className="plan-metric-value">{valor ?? t("plan.onRequest")}</span>
                    {plano.discountCents > 0 && (
                      <span className="plan-metric-sub plan-discount-row">
                        <span className="plan-list-price">{formatarValor(plano.listPrice, i18n.language)}</span>
                        <span className="plan-discount-chip">
                          -{formatarValor(plano.discountCents / 100, i18n.language)}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="plan-metric">
                    <span className="plan-metric-label">
                      <IconCalendar />
                      {plano.status === "expired" ? t("plan.expiredOnLabel") : t("plan.renewsOnLabel")}
                    </span>
                    <span className="plan-metric-value">{dataFim ?? "—"}</span>
                    {plano.daysLeft !== null && plano.daysLeft > 0 && (
                      <>
                        <span className="plan-metric-sub">{t("plan.daysLeftValue", { count: plano.daysLeft })}</span>
                        {progressoValidade !== null && (
                          <span className="plan-progress-track">
                            <span
                              className={
                                "plan-progress-fill" +
                                (plano.daysLeft <= 2 ? " danger" : plano.daysLeft <= 3 ? " warn" : "")
                              }
                              style={{ width: progressoValidade + "%" }}
                            />
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="plan-metric">
                    <span className="plan-metric-label">
                      <IconUsers />
                      {t("plan.usersLabel")}
                    </span>
                    <span className="plan-metric-value">
                      {plano.userCount} / {limite}
                    </span>
                    {progressoUsuarios !== null && (
                      <span className="plan-progress-track">
                        <span
                          className={"plan-progress-fill" + (!plano.canAddUser ? " danger" : "")}
                          style={{ width: progressoUsuarios + "%" }}
                        />
                      </span>
                    )}
                  </div>
                </div>

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
                        setCheckout({
                          id: cobranca.pendingPayment.plan,
                          priceCents: cobranca.pendingPayment.amountCents,
                          // Melhor esforço: o carrinho de quando a cobrança foi
                          // emitida - a assinatura pode ter mudado desde então,
                          // mas é o que dá pra mostrar no resumo sem uma rota nova.
                          modules: cobranca.subscription?.requestedModules,
                          addons: cobranca.subscription?.requestedAddons,
                        })
                      }
                    >
                      {t("billing.finishPayment")}
                    </button>
                  )}
                </div>
              )}

              {cobranca?.subscription && (
                <div className="plan-subscription plan-section-card">
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
                <div className="plan-history plan-section-card">
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
                  <h3>{escolhaLivre ? t("plan.selectTitle") : t("plan.upgradeTitle")}</h3>
                  <div className="plan-grid">
                    {(plano.catalog || []).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={"plan-tile" + (p.current ? " current" : "")}
                        onClick={() => p.selfSelectable && trocarPara(p)}
                        disabled={!p.selfSelectable || trocando !== null}
                      >
                        {p.current && <span className="plan-tile-tag">{t("plan.currentBadge")}</span>}
                        <span className="plan-tile-name">{t(`plan.names.${p.id}`)}</span>
                        <span className="plan-tile-price">
                          {formatarValor(p.price, i18n.language)}
                          <small>{t("plan.perMonth")}</small>
                        </span>
                        <span className="plan-tile-desc">{moduleCapLabel(p, t)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="plan-callout">
                    <IconInfo />
                    <span className="plan-callout-text">
                      {escolhaLivre ? t("plan.freeChoiceHint") : t("plan.downgradeHint")}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="plan-callout">
                  <IconInfo />
                  <span className="plan-callout-text">{t("plan.masterOnly")}</span>
                </div>
              )}
            </>
          )}
        </div>
        )}
      </div>

      {checkout && (
        <CheckoutModal
          plan={checkout.id}
          priceCents={checkout.priceCents}
          modules={checkout.modules}
          addons={checkout.addons}
          addonCatalog={plano?.addonCatalog || []}
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
