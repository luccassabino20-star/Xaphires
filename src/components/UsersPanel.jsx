import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUsers } from "../state/UsersContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import { initials, colorForUser } from "../utils/members.js";

export default function UsersPanel({ onClose }) {
  const { t } = useTranslation();
  const { users, createUser, deleteUser, resetPassword, setRole } = useUsers();
  const { user: currentUser } = useAuth();
  const showToast = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetTargetId, setResetTargetId] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await createUser({ name, email, password });
      setName("");
      setEmail("");
      setPassword("");
      setShowCreate(false);
      showToast(t("users.userCreatedToast"));
    } catch (err) {
      setError(translateError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMakeMaster(u) {
    if (!confirm(t("users.makeMasterConfirm", { name: u.name }))) return;
    try {
      await setRole(u.id, "master");
      showToast(t("users.becameMasterToast", { name: u.name }));
    } catch (err) {
      alert(translateError(err, t));
    }
  }

  async function handleDelete(u) {
    if (!confirm(t("users.deleteUserConfirm", { name: u.name }))) return;
    try {
      await deleteUser(u.id);
      showToast(t("users.userDeletedToast"));
    } catch (err) {
      alert(translateError(err, t));
    }
  }

  async function handleResetSubmit(e) {
    e.preventDefault();
    if (resetPasswordValue.length < 6) {
      alert(t("users.passwordMinLength"));
      return;
    }
    try {
      await resetPassword(resetTargetId, resetPasswordValue);
      showToast(t("users.passwordResetToast"));
      setResetTargetId(null);
      setResetPasswordValue("");
    } catch (err) {
      alert(translateError(err, t));
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-wide">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>
        <div className="modal-header">
          <h2 className="members-modal-title">{t("users.title")}</h2>
        </div>
        <div className="modal-body">
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th></th>
                  <th>{t("users.colName")}</th>
                  <th>{t("users.colEmail")}</th>
                  <th>{t("users.colRole")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="avatar avatar-small" style={{ background: colorForUser(u.id) }}>
                        {initials(u.name)}
                      </span>
                    </td>
                    <td>
                      {u.name}
                      {u.id === currentUser.id && <span className="users-table-you">{t("users.you")}</span>}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span className={"role-badge" + (u.role === "master" ? " master" : "")}>
                        {u.role === "master" ? t("users.roleMaster") : t("users.roleMember")}
                      </span>
                    </td>
                    <td className="users-table-actions">
                      {u.role !== "master" && (
                        <>
                          <button className="btn-ghost btn-small" onClick={() => handleMakeMaster(u)}>
                            {t("users.makeMaster")}
                          </button>
                          <button
                            className="btn-ghost btn-small"
                            onClick={() => {
                              setResetTargetId(u.id);
                              setResetPasswordValue("");
                            }}
                          >
                            {t("users.resetPassword")}
                          </button>
                          <button className="btn-danger btn-small" onClick={() => handleDelete(u)}>
                            {t("users.delete")}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {resetTargetId && (
            <form className="users-reset-form" onSubmit={handleResetSubmit}>
              <label className="auth-field">
                <span>{t("users.newPasswordFor", { name: users.find((u) => u.id === resetTargetId)?.name })}</span>
                <input
                  type="password"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  minLength={6}
                  required
                  autoFocus
                />
              </label>
              <div className="composer-actions">
                <button type="submit" className="btn-primary btn-small">
                  {t("users.savePassword")}
                </button>
                <button type="button" className="btn-cancel" onClick={() => setResetTargetId(null)}>
                  &times;
                </button>
              </div>
            </form>
          )}

          <div className="sidebar-divider" />

          {showCreate ? (
            <form className="users-create-form" onSubmit={handleCreate}>
              <label className="auth-field">
                <span>{t("users.name")}</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </label>
              <label className="auth-field">
                <span>{t("users.email")}</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label className="auth-field">
                <span>{t("users.password")}</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </label>
              {error && <div className="auth-error">{error}</div>}
              <div className="composer-actions">
                <button type="submit" className="btn-primary btn-small" disabled={submitting}>
                  {submitting ? t("users.creating") : t("users.createUser")}
                </button>
                <button type="button" className="btn-cancel" onClick={() => setShowCreate(false)}>
                  &times;
                </button>
              </div>
            </form>
          ) : (
            <button className="btn-primary btn-small" onClick={() => setShowCreate(true)}>
              {t("users.newUser")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
