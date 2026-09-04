import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import { docValido, formatarDoc, normalizarDoc } from "../utils/doc.js";
import * as api from "../state/api.js";
import PlanStepper from "./PlanStepper.jsx";

// Intervalo da consulta de status enquanto a cobrança está pendente. Webhook perdido
// é comum, e sem essa conferência o cliente paga e fica olhando uma tela que não
// muda. 4s é curto para parecer imediato e longo para não martelar o gateway.
const INTERVALO_CONSULTA = 4000;

function formatarValor(cents, locale) {
  if (cents === null || cents === undefined) return "";
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(cents / 100);
}

function IconePix() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M12 2.6 3.9 10.7a1.8 1.8 0 0 0 0 2.6L12 21.4l8.1-8.1a1.8 1.8 0 0 0 0-2.6zm0 2.6 6.2 6.2-6.2 6.2-6.2-6.2z" />
    </svg>
  );
}
function IconeCartao() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1H3zm0 4h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm3 5v2h5v-2z" />
    </svg>
  );
}
function IconeBoleto() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M3 4h2v16H3zm3 0h1v16H6zm2 0h2v16H8zm3 0h1v16h-1zm2 0h2v16h-2zm3 0h1v16h-1zm2 0h3v16h-3z" />
    </svg>
  );
}

const ICONES = { pix: IconePix, card: IconeCartao, boleto: IconeBoleto };

export default function CheckoutModal({ plan, priceCents, modules, addons, addonCatalog, simulated, docInicial, onClose, onPaid }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();

  const [metodo, setMetodo] = useState("pix");
  // Vem preenchido quando a empresa já assinou antes: ninguém quer redigitar o CNPJ
  // a cada renovação.
  const [doc, setDoc] = useState(() => formatarDoc(docInicial || ""));
  const [docTocado, setDocTocado] = useState(false);
  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const [validade, setValidade] = useState("");
  const [cvv, setCvv] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [cobranca, setCobranca] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const timerRef = useRef(null);

  // Consulta o estado enquanto a cobrança está pendente. Para no primeiro estado
  // final, e o clearInterval do cleanup evita seguir consultando com o modal fechado.
  // No cartão com provedor real isto nunca chega a rodar de fato: pagar() já
  // redireciona para o checkout hospedado antes de guardar qualquer cobrança em
  // estado "pending" por aqui - ver o comentário em pagar().
  useEffect(() => {
    if (!cobranca || cobranca.status !== "pending") return;
    timerRef.current = setInterval(async () => {
      try {
        const { payment } = await api.checkPayment(cobranca.id);
        if (payment?.status !== "pending") {
          setCobranca(payment);
          if (payment?.status === "paid") onPaid?.();
        }
      } catch {
        /* falha de rede na consulta não precisa aparecer: a próxima tenta de novo */
      }
    }, INTERVALO_CONSULTA);
    return () => clearInterval(timerRef.current);
  }, [cobranca, onPaid]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function pagar(e) {
    e.preventDefault();
    setErro("");
    // Confere antes de gastar a chamada: documento inválido volta do gateway como
    // erro genérico, difícil de explicar na tela.
    //
    // Só marca o campo, sem mensagem geral: o aviso inline já diz o que está errado
    // e aponta para onde corrigir. Repetir o mesmo texto na caixa de erro embaixo
    // dava a impressão de dois problemas diferentes.
    if (docObrigatorio && !docValido(doc)) {
      setDocTocado(true);
      return;
    }
    setEnviando(true);
    try {
      // Provedor simulado: os campos são nossos e o "número" é de mentira. Com
      // provedor real não existe campo de cartão nenhum pra preencher aqui - a
      // pessoa digita o número na página hospedada do gateway, depois do
      // redirecionamento logo abaixo. Nenhum dado de cartão passa por este código.
      const card = metodo === "card" && simulated ? { number: numero.replace(/\s+/g, ""), name: nome, validade, cvv } : undefined;
      const r = await api.subscribe({
        plan,
        method: metodo,
        card,
        payerDoc: normalizarDoc(doc) || undefined,
        modules: modules || [],
        addons: addons || [],
      });
      if (metodo === "card" && !simulated && r.payment?.checkoutUrl) {
        // Sai do app agora: quem confirma o pagamento é a página do gateway. A
        // volta (successUrl/cancelUrl configurados no servidor) cai no app de
        // novo com ?billing=return, que reabre o plano e mostra o que ficou -
        // ver App.jsx.
        window.location.href = r.payment.checkoutUrl;
        return;
      }
      setCobranca(r.payment);
      if (r.payment?.status === "paid") {
        showToast(t("billing.paidToast"));
        onPaid?.();
      }
    } catch (err) {
      // Cobrança já em aberto volta com a cobrança no corpo: mostra ela em vez de
      // um erro seco, que é o que o cliente precisa para terminar de pagar.
      if (err.code === "PAYMENT_ALREADY_PENDING" && err.payment) setCobranca(err.payment);
      setErro(translateError(err, t));
    } finally {
      setEnviando(false);
    }
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      showToast(t("billing.copyFailed"));
    }
  }

  async function confirmarSimulado() {
    try {
      const { payment } = await api.devConfirmPayment(cobranca.id);
      setCobranca(payment);
      if (payment?.status === "paid") {
        showToast(t("billing.paidToast"));
        onPaid?.();
      }
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  const pago = cobranca?.status === "paid";
  const pendente = cobranca?.status === "pending";
  const falhou = cobranca?.status === "failed";
  // Pix e boleto exigem documento do pagador no Brasil. No cartão quem identifica é
  // o próprio cartão, então não se pede.
  const docObrigatorio = metodo === "pix" || metodo === "boleto";
  const docComErro = docTocado && docObrigatorio && doc.length > 0 && !docValido(doc);

  // Discrimina o total em plano + add-ons pro painel de resumo - deriva do
  // addonCatalog (preço) em vez de receber um valor já pronto, então
  // qualquer chamador que só tenha plan/priceCents (ex.: retomar um Pix
  // pendente sem saber mais o carrinho) ainda funciona: addons vazio faz
  // baseCents cair pro total inteiro, uma linha só, sem quebrar.
  const catalogo = addonCatalog || [];
  const addonsSelecionados = (addons || []).map((id) => catalogo.find((a) => a.id === id)).filter(Boolean);
  const addonsCents = addonsSelecionados.reduce((soma, a) => soma + a.priceCents, 0);
  const baseCents = priceCents - addonsCents;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal checkout-modal premium-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>

        {!cobranca ? (
          <>
            <div className="premium-modal-header">
              <span className="premium-badge">{t(`plan.names.${plan}`)}</span>
              <h2 className="premium-modal-title">{t("billing.checkoutTitle", { plan: t(`plan.names.${plan}`) })}</h2>
              <p className="premium-modal-subtitle">{t("billing.checkoutSubtitle")}</p>
              <PlanStepper current={3} />
            </div>

            <div className="premium-body">
            <div className="module-picker-scroll">
            <form id="checkout-payment-form" onSubmit={pagar}>
              <label className="modal-label">{t("billing.chooseMethod")}</label>
              <div className="checkout-methods">
                {["pix", "card", "boleto"].map((m) => {
                  const Icone = ICONES[m];
                  return (
                    <button
                      type="button"
                      key={m}
                      className={"checkout-method" + (metodo === m ? " active" : "")}
                      onClick={() => setMetodo(m)}
                    >
                      <Icone />
                      <span className="checkout-method-name">{t(`billing.methods.${m}`)}</span>
                      <span className="checkout-method-note">{t(`billing.methodNotes.${m}`)}</span>
                    </button>
                  );
                })}
              </div>

              {docObrigatorio && (
                <label className="auth-field checkout-doc">
                  <span>{t("billing.docLabel")}</span>
                  <input
                    value={doc}
                    onChange={(e) => setDoc(formatarDoc(e.target.value))}
                    onBlur={() => setDocTocado(true)}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-invalid={docComErro || undefined}
                    required
                  />
                  {docComErro ? (
                    <span className="checkout-doc-error">{t("billing.docInvalid")}</span>
                  ) : (
                    <span className="checkout-doc-hint">{t("billing.docHint")}</span>
                  )}
                </label>
              )}

              {/* Sem campo de cartão nenhum aqui de propósito: com provedor real, o
                  número é digitado na página hospedada do gateway, depois do
                  redirecionamento em pagar() - nunca no nosso formulário. */}
              {metodo === "card" && !simulated && (
                <p className="checkout-testhint checkout-redirect-note">{t("billing.cardRedirectNote")}</p>
              )}

              {metodo === "card" && simulated && (
                <div className="checkout-card-form">
                  <p className="checkout-testmode">{t("billing.testMode")}</p>
                  <label className="auth-field">
                    <span>{t("billing.cardNumber")}</span>
                    <input
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      placeholder="4111 1111 1111 1111"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                    />
                  </label>
                  <label className="auth-field">
                    <span>{t("billing.cardName")}</span>
                    <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" required />
                  </label>
                  <div className="checkout-card-row">
                    <label className="auth-field">
                      <span>{t("billing.cardExpiry")}</span>
                      <input
                        value={validade}
                        onChange={(e) => setValidade(e.target.value)}
                        placeholder="12/30"
                        autoComplete="off"
                        required
                      />
                    </label>
                    <label className="auth-field">
                      <span>{t("billing.cardCvv")}</span>
                      <input value={cvv} onChange={(e) => setCvv(e.target.value)} autoComplete="off" required />
                    </label>
                  </div>
                  <p className="checkout-testhint">{t("billing.testCards")}</p>
                </div>
              )}

              {erro && <div className="auth-error">{erro}</div>}
            </form>
            </div>

            <div className="premium-summary-panel">
              <span className="premium-summary-eyebrow">{t("plan.modulePicker.totalLabel")}</span>
              <strong className="premium-summary-total-value" key={priceCents}>
                {formatarValor(priceCents, i18n.language)}
              </strong>
              <span className="premium-summary-permonth">{t("plan.perMonth")}</span>

              <div className="premium-summary-lines">
                <div className="premium-summary-line">
                  <span>{t(`plan.names.${plan}`)}</span>
                  <span>{formatarValor(baseCents, i18n.language)}</span>
                </div>
                {addonsSelecionados.map((a) => (
                  <div className="premium-summary-line addon" key={a.id}>
                    <span>{t(a.labelKey)}</span>
                    <span>+{formatarValor(a.priceCents, i18n.language)}</span>
                  </div>
                ))}
              </div>

              <button type="submit" form="checkout-payment-form" className="premium-cta" disabled={enviando}>
                {enviando ? t("billing.processing") : metodo === "card" && !simulated ? t("billing.continueToCheckout") : t("billing.payNow")}
              </button>
              <p className="premium-summary-fineprint">{t("billing.fineprint")}</p>
            </div>
            </div>
          </>
        ) : (
          <div className="premium-body premium-body-single">
          {pendente && (
            <div className="checkout-pending">
              <div className="checkout-status-badge pending">{t("billing.awaitingPayment")}</div>

              {cobranca.pixCode && (
                <>
                  <label className="modal-label">{t("billing.pixCopyPaste")}</label>
                  <div className="checkout-code">{cobranca.pixCode}</div>
                  <button className="btn-primary btn-small" onClick={() => copiar(cobranca.pixCode)}>
                    {copiado ? t("billing.copied") : t("billing.copyCode")}
                  </button>
                </>
              )}

              {cobranca.boletoLine && (
                <>
                  <label className="modal-label">{t("billing.boletoLine")}</label>
                  <div className="checkout-code">{cobranca.boletoLine}</div>
                  <button className="btn-primary btn-small" onClick={() => copiar(cobranca.boletoLine)}>
                    {copiado ? t("billing.copied") : t("billing.copyCode")}
                  </button>
                </>
              )}

              {cobranca.dueAt && (
                <p className="checkout-due">
                  {t("billing.payUntil", { date: new Date(cobranca.dueAt).toLocaleString(i18n.language) })}
                </p>
              )}
              <p className="checkout-polling">{t("billing.willUpdateAlone")}</p>

              {simulated && (
                <button className="btn-secondary btn-small checkout-simulate" onClick={confirmarSimulado}>
                  {t("billing.simulateConfirm")}
                </button>
              )}
            </div>
          )}

          {pago && (
            <div className="checkout-done">
              <div className="checkout-status-badge paid">{t("billing.paid")}</div>
              <p>{t("billing.releasedUntil", { date: new Date(cobranca.periodEnd).toLocaleDateString(i18n.language) })}</p>
              <button className="btn-primary" onClick={onClose}>
                {t("common.close")}
              </button>
            </div>
          )}

          {falhou && (
            <div className="checkout-failed">
              <div className="checkout-status-badge failed">{t("billing.failed")}</div>
              <p>{t(`billing.failureReasons.${cobranca.failureReason}`, { defaultValue: t("billing.failureGeneric") })}</p>
              <button className="btn-secondary" onClick={() => setCobranca(null)}>
                {t("billing.tryAgain")}
              </button>
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
}
