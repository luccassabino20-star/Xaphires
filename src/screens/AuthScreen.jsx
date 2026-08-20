import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import { normalizarDoc, formatarDoc, docValido } from "../utils/doc.js";
import { getCompanyByCnpj, sendJoinRequest } from "../state/api.js";
import LanguageSwitcher from "../components/LanguageSwitcher.jsx";
import xaphiresLogo from "../assets/xaphires-logo.png";

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6h16v12H4zm0 0 8 7 8-7"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17">
      <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function EyeIcon({ off }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {off && <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M3 3l18 18" />}
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

// Campo com ícone à esquerda, reaproveitado nos três formulários (login,
// cadastro de empresa e pedido de acesso) - todos têm e-mail e senha.
function IconField({ icon, label, children }) {
  return (
    <label className="auth-field auth-field-icon-wrap">
      <span>{label}</span>
      <span className="auth-input-group">
        {icon}
        {children}
      </span>
    </label>
  );
}

function EmailField({ label, value, onChange, autoFocus }) {
  return (
    <IconField icon={<MailIcon />} label={label}>
      <input type="email" value={value} onChange={onChange} required autoFocus={autoFocus} />
    </IconField>
  );
}

// O olho de mostrar/ocultar é só conveniência de digitação - a senha em si
// nunca sai do estado do formulário nem vira log em lugar nenhum.
function PasswordField({ label, value, onChange, minLength = 6, autoFocus }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <IconField icon={<LockIcon />} label={label}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        required
        minLength={minLength}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="auth-field-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={t(visible ? "auth.hidePassword" : "auth.showPassword")}
        title={t(visible ? "auth.hidePassword" : "auth.showPassword")}
      >
        <EyeIcon off={!visible} />
      </button>
    </IconField>
  );
}

// Pedir acesso é um fluxo à parte do login/cadastro: tem um passo antes (achar a
// empresa pelo CNPJ) que os outros dois não têm, e só depois disso o resto do
// formulário faz sentido de aparecer - por isso não tenta compartilhar o mesmo
// <form> de baixo, que assume que os campos visíveis já são os que vão ser
// enviados.
function JoinForm({ onDone }) {
  const { t } = useTranslation();
  const [cnpjInput, setCnpjInput] = useState("");
  const [company, setCompany] = useState(null); // { id, name } | null
  const [searching, setSearching] = useState(false);
  const [cnpjError, setCnpjError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    setCnpjError("");
    const digits = normalizarDoc(cnpjInput);
    if (!docValido(digits)) {
      setCnpjError(t("errors.CNPJ_INVALID"));
      return;
    }
    setSearching(true);
    try {
      setCompany(await getCompanyByCnpj(digits));
    } catch (err) {
      setCnpjError(translateError(err, t));
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(t("auth.passwordsMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      await sendJoinRequest({ cnpj: normalizarDoc(cnpjInput), name, email, password });
      setSent(true);
    } catch (err) {
      setError(translateError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-join-success">
        <p className="auth-join-success-title">{t("auth.joinSuccessTitle")}</p>
        <p>{t("auth.joinSuccessText")}</p>
        <button type="button" className="btn-primary auth-submit" onClick={onDone}>
          {t("auth.joinSuccessBackToLogin")}
        </button>
      </div>
    );
  }

  if (!company) {
    return (
      <form className="auth-form" onSubmit={handleSearch}>
        <p className="auth-join-intro">{t("auth.joinIntro")}</p>
        <label className="auth-field">
          <span>{t("auth.cnpjLabel")}</span>
          <input
            type="text"
            inputMode="numeric"
            value={cnpjInput}
            onChange={(e) => setCnpjInput(formatarDoc(e.target.value))}
            required
            autoFocus
          />
        </label>
        {cnpjError && <div className="auth-error">{cnpjError}</div>}
        <button type="submit" className="btn-primary auth-submit" disabled={searching}>
          {searching ? t("auth.cnpjSearching") : t("auth.cnpjSearch")}
        </button>
      </form>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <p className="auth-join-intro auth-join-found">{t("auth.companyFound", { name: company.name })}</p>
      <label className="auth-field">
        <span>{t("auth.yourName")}</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </label>
      <EmailField label={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} />
      <PasswordField label={t("auth.password")} value={password} onChange={(e) => setPassword(e.target.value)} />
      <PasswordField label={t("auth.confirmPassword")} value={confirm} onChange={(e) => setConfirm(e.target.value)} />

      {error && <div className="auth-error">{error}</div>}

      <button type="submit" className="btn-primary auth-submit" disabled={submitting}>
        {submitting ? t("auth.joinSubmitWait") : t("auth.joinSubmit")}
      </button>
      <button type="button" className="auth-join-change-cnpj" onClick={() => setCompany(null)}>
        {t("auth.notThisCompany")}
      </button>
    </form>
  );
}

export default function AuthScreen({ onBack }) {
  const { t } = useTranslation();
  const { login, registerCompany } = useAuth();
  const showToast = useToast();
  const [mode, setMode] = useState("login"); // "login" | "signup" | "join"
  const [companyName, setCompanyName] = useState("");
  const [companyDoc, setCompanyDoc] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (mode === "signup" && password !== confirm) {
      setError(t("auth.passwordsMismatch"));
      return;
    }
    if (mode === "signup" && !docValido(normalizarDoc(companyDoc))) {
      setError(t("errors.CNPJ_INVALID"));
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login({ email, password });
      } else {
        await registerCompany({ companyName, name, email, password, cnpj: normalizarDoc(companyDoc) });
      }
    } catch (err) {
      setError(translateError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError("");
  }

  return (
    <div className="auth-shell">
      <div className="auth-theme-toggle auth-toolbar">
        <LanguageSwitcher />
      </div>
      {onBack && (
        <button className="auth-back-btn" onClick={onBack}>
          {t("auth.back")}
        </button>
      )}
      <div className="auth-brand">
        <div className="landing-nav-brand">
          <img className="landing-nav-icon" src={xaphiresLogo} alt="Xaphires" />
          <span>{t("auth.brandTitle")}</span>
        </div>
        <h1 className="auth-brand-headline">
          {t("auth.brandHeadlinePrefix")}
          <em>{t("auth.brandHeadlineEmphasis")}</em>
          {t("auth.brandHeadlineSuffix")}
        </h1>
      </div>
      <div className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-header">
            <span className="auth-card-eyebrow">{t(`auth.eyebrow.${mode}`)}</span>
            <h2>{t(`auth.welcome.${mode}`)}</h2>
          </div>
          <div className="auth-tabs">
            <button className={"auth-tab" + (mode === "login" ? " active" : "")} onClick={() => switchMode("login")}>
              {t("auth.tabLogin")}
            </button>
            <button className={"auth-tab" + (mode === "signup" ? " active" : "")} onClick={() => switchMode("signup")}>
              {t("auth.tabSignup")}
            </button>
            <button className={"auth-tab" + (mode === "join" ? " active" : "")} onClick={() => switchMode("join")}>
              {t("auth.tabJoin")}
            </button>
          </div>

          {mode === "join" ? (
            <JoinForm onDone={() => switchMode("login")} />
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              {mode === "signup" && (
                <>
                  <label className="auth-field">
                    <span>{t("auth.companyName")}</span>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      required
                      autoFocus
                    />
                  </label>
                  <label className="auth-field">
                    <span>{t("auth.companyDocLabel")}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={companyDoc}
                      onChange={(e) => setCompanyDoc(formatarDoc(e.target.value))}
                      required
                    />
                  </label>
                  <label className="auth-field">
                    <span>{t("auth.yourName")}</span>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                  </label>
                </>
              )}
              <EmailField
                label={t("auth.email")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus={mode === "login"}
              />
              <PasswordField label={t("auth.password")} value={password} onChange={(e) => setPassword(e.target.value)} />
              {mode === "signup" && (
                <PasswordField label={t("auth.confirmPassword")} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              )}
              {mode === "login" && (
                <button
                  type="button"
                  className="auth-forgot-password"
                  onClick={() => showToast(t("auth.forgotPasswordHint"))}
                >
                  {t("auth.forgotPassword")}
                </button>
              )}

              {error && <div className="auth-error">{error}</div>}

              <button type="submit" className="btn-primary auth-submit" disabled={submitting}>
                {submitting ? t("auth.submitWait") : mode === "login" ? t("auth.submitLogin") : t("auth.submitSignup")}
                {!submitting && <ArrowRightIcon />}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
