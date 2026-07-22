import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import * as api from "../state/api.js";
import { initials, colorForUser } from "../utils/members.js";

export default function AccountMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setChangingPassword(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function submitChangePassword(e) {
    e.preventDefault();
    setError("");
    try {
      await api.changePassword({ currentPassword, newPassword });
      showToast(t("app.accountMenu.passwordChangedToast"));
      setChangingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setOpen(false);
    } catch (err) {
      setError(translateError(err, t));
    }
  }

  if (!user) return null;

  return (
    <div className="account-menu" ref={ref}>
      <button className="avatar account-menu-btn" style={{ background: colorForUser(user.id) }} onClick={() => setOpen((o) => !o)}>
        {initials(user.name)}
      </button>
      {open && (
        <div className="dropdown account-dropdown">
          <div className="account-dropdown-header">
            <div className="account-dropdown-name">
              {user.name}
              {user.role === "master" && <span className="role-badge master">{t("app.accountMenu.master")}</span>}
            </div>
            <div className="account-dropdown-email">{user.email}</div>
          </div>
          <div className="dropdown-divider" />
          {changingPassword ? (
            <form className="account-password-form" onSubmit={submitChangePassword}>
              <input
                type="password"
                placeholder={t("app.accountMenu.currentPassword")}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoFocus
              />
              <input
                type="password"
                placeholder={t("app.accountMenu.newPassword")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              {error && <div className="auth-error">{error}</div>}
              <div className="composer-actions">
                <button type="submit" className="btn-primary btn-small">
                  {t("app.accountMenu.save")}
                </button>
                <button type="button" className="btn-cancel" onClick={() => setChangingPassword(false)}>
                  &times;
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="dropdown-item" onClick={() => setChangingPassword(true)}>
                {t("app.accountMenu.changePassword")}
              </div>
              <div className="dropdown-item danger" onClick={logout}>
                {t("app.accountMenu.logout")}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
