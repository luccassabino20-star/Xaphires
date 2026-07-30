import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { translateError } from "../utils/errors.js";
import LanguageSwitcher from "../components/LanguageSwitcher.jsx";
import LandingThemeToggle from "../components/LandingThemeToggle.jsx";

export default function AuthScreen({ onBack }) {
  const { t } = useTranslation();
  const { login, registerCompany } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup"
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
          </div>

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
        </div>
      </div>
    </div>
  );
}
