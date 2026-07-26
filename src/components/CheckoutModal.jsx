import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import { docValido, formatarDoc, normalizarDoc } from "../utils/doc.js";
import * as api from "../state/api.js";

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

export default function CheckoutModal({ plan, priceCents, simulated, docInicial, onClose, onPaid }) {
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
      // Com provedor real este objeto leva um token gerado pelo SDK no navegador, e
      // nunca o número digitado. Ver o comentário em api.js.
      const card =
        metodo === "card" && simulated ? { number: numero.replace(/\s+/g, ""), name: nome, validade, cvv } : undefined;
      const r = await api.subscribe({ plan, method: metodo, card, payerDoc: normalizarDoc(doc) || undefined });
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

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal checkout-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>
        <div className="modal-header">
          <h2 className="checkout-title">{t("billing.checkoutTitle", { plan: t(`plan.names.${plan}`) })}</h2>
        </div>

        <div className="modal-body">
          <div className="checkout-amount">
            {formatarValor(priceCents, i18n.language)}
            <span>{t("plan.perMonth")}</span>
          </div>

          {!cobranca && (
            <form onSubmit={pagar}>
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

              {metodo === "card" && !simulated && (
                <p className="checkout-warning">{t("billing.cardUnavailable")}</p>
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

              <button
                type="submit"
                className="btn-primary checkout-submit"
                disabled={enviando || (metodo === "card" && !simulated)}
              >
                {enviando ? t("billing.processing") : t("billing.payNow")}
              </button>
              <p className="checkout-fineprint">{t("billing.fineprint")}</p>
            </form>
          )}

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
      </div>
    </div>
  );
}
