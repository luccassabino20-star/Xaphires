import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import PlanModal from "./PlanModal.jsx";
import ProfileModal from "./ProfileModal.jsx";

// Carregado sob demanda: o painel arrasta junto os quatro componentes de
// administração, e importá-lo direto colocava ~22 kB de ferramenta interna no
// pacote que TODO cliente baixa. Assim ele só é buscado por quem abre o painel.
const PlataformaModal = lazy(() => import("./PlataformaModal.jsx"));
import * as api from "../state/api.js";
import { initials, colorForUser } from "../utils/members.js";

export default function AccountMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [plataformaOpen, setPlataformaOpen] = useState(false);
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

  // Volta do checkout hospedado do cartão (ver providers/asaas.js e o comentário
  // em pagar(), no CheckoutModal): a pessoa saiu do app pra pagar e a página de
  // retorno do gateway manda de volta pra cá com ?billing=return. Reabre o plano
  // sozinho, sem precisar procurar o menu de novo - é lá que o pagamento pendente
  // (ou já confirmado, se o webhook chegou primeiro) aparece.
  useEffect(() => {
    if (!window.location.search.includes("billing=return")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("billing");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    setPlanOpen(true);
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
      <button
        className="avatar account-menu-btn"
        style={user.avatarUrl ? undefined : { background: colorForUser(user.id) }}
        onClick={() => setOpen((o) => !o)}
      >
        {user.avatarUrl ? <img className="avatar-img-fill" src={user.avatarUrl} alt="" /> : initials(user.name)}
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
              {/* Só aparece para quem também administra a plataforma. Abrir o item
                  não concede nada: o painel busca tudo da API de administração, que
                  exige a sessão própria, e pede a senha na primeira vez. */}
              {user.platformAdmin && (
                <div className="dropdown-item" onClick={() => { setPlataformaOpen(true); setOpen(false); }}>
                  {t("app.accountMenu.platformPanel")}
                </div>
              )}
              <div className="dropdown-item" onClick={() => { setProfileOpen(true); setOpen(false); }}>
                {t("app.accountMenu.myProfile")}
              </div>
              <div className="dropdown-item" onClick={() => { setPlanOpen(true); setOpen(false); }}>
                {t("plan.menuItem")}
              </div>
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
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
      {planOpen && <PlanModal onClose={() => setPlanOpen(false)} />}
      {plataformaOpen && (
        <Suspense fallback={null}>
          <PlataformaModal onClose={() => setPlataformaOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
