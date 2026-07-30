import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { translateError } from "../utils/errors.js";
import { normalizarDoc, formatarDoc, cnpjValido } from "../utils/doc.js";
import { getCompanyByCnpj, sendJoinRequest } from "../state/api.js";
import LanguageSwitcher from "../components/LanguageSwitcher.jsx";
import LandingThemeToggle from "../components/LandingThemeToggle.jsx";

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
    if (!cnpjValido(digits)) {
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
            placeholder={t("auth.cnpjPlaceholder")}
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
      <label className="auth-field">
        <span>{t("auth.email")}</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="auth-field">
        <span>{t("auth.password")}</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
      </label>
      <label className="auth-field">
        <span>{t("auth.confirmPassword")}</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
      </label>

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
  const [mode, setMode] = useState("login"); // "login" | "signup" | "join"
  const [companyName, setCompanyName] = useState("");
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
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login({ email, password });
      } else {
        await registerCompany({ companyName, name, email, password });
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
        <LandingThemeToggle />
        <LanguageSwitcher />
      </div>
      {onBack && (
        <button className="auth-back-btn" onClick={onBack}>
          {t("auth.back")}
        </button>
      )}
      <div className="auth-brand">
        <div className="auth-brand-icon">C</div>
        <h1>{t("auth.brandTitle")}</h1>
        <p>{t("auth.brandText")}</p>
      </div>
      <div className="auth-panel">
        <div className="auth-card">
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
                    <span>{t("auth.yourName")}</span>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                  </label>
                </>
              )}
              <label className="auth-field">
                <span>{t("auth.email")}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus={mode === "login"}
                />
              </label>
              <label className="auth-field">
                <span>{t("auth.password")}</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </label>
              {mode === "signup" && (
                <label className="auth-field">
                  <span>{t("auth.confirmPassword")}</span>
                  <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
                </label>
              )}

              {error && <div className="auth-error">{error}</div>}

              <button type="submit" className="btn-primary auth-submit" disabled={submitting}>
                {submitting ? t("auth.submitWait") : mode === "login" ? t("auth.submitLogin") : t("auth.submitSignup")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
