import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUsers } from "../state/UsersContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import { normalizarDoc, formatarDoc } from "../utils/doc.js";
import * as api from "../state/api.js";
import Avatar from "./Avatar.jsx";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15">
      <path
        fill="currentColor"
        d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14"
      />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 9h10v10H9zM5 15V5h10"
      />
    </svg>
  );
}
function KebabIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path fill="currentColor" d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 7a3 3 0 1 1-3 3M15 7a3 3 0 1 0-3 3m3-3-8 8m2 2-2-2m0 0-2 2 2 2 2-2"
      />
    </svg>
  );
}
function CrownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="m3 8 4 3 5-6 5 6 4-3-2 10H5zM5 20h14v2H5z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3zm2 5h2v10h-2zm-4 0h2v10H7zm8 0h2v10h-2z" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

// Menu de ações da linha (Redefinir senha / Tornar master / Excluir). Mesma
// técnica do PropertyPopover.jsx (position: fixed calculado do
// getBoundingClientRect do botão, sem portal) - não o .dropdown posicionado
// por CSS (top:100%/right:0) que o ListMenu usa: aqui o botão vive dentro da
// lista rolável do painel, e uma linha perto do fim do scroll cortava o menu
// pela metade contra o overflow-y:auto de .users-panel-body. position:fixed
// escapa desse clipping porque nenhum ancestral cria containing block pra
// fixed (sem transform/filter no caminho até a raiz).
function UserActionsMenu({ anchorEl, onClose, onResetPassword, onMakeMaster, onDelete, t }) {
  const ref = useRef(null);
  const [coords, setCoords] = useState(null);

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [anchorEl]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) && !anchorEl?.contains(e.target)) {
        onClose();
      }
    }
    // Rolar a lista com o menu aberto desalinharia o popover do botão (ele não
    // acompanha o scroll ao vivo) - fechar é mais simples e barato que
    // recalcular a posição a cada evento de scroll.
    const scrollParent = anchorEl?.closest(".users-panel-body");
    document.addEventListener("mousedown", handleClick);
    scrollParent?.addEventListener("scroll", onClose);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      scrollParent?.removeEventListener("scroll", onClose);
    };
  }, [onClose, anchorEl]);

  if (!coords) return null;

  return (
    <div className="dropdown users-row-menu" ref={ref} style={{ position: "fixed", top: coords.top, right: coords.right }}>
      <div className="dropdown-item" onClick={onResetPassword}>
        <KeyIcon /> {t("users.resetPassword")}
      </div>
      <div className="dropdown-item" onClick={onMakeMaster}>
        <CrownIcon /> {t("users.makeMaster")}
      </div>
      <div className="dropdown-divider" />
      <div className="dropdown-item danger" onClick={onDelete}>
        <TrashIcon /> {t("users.delete")}
      </div>
    </div>
  );
}

// initialShowCreate: quem chega aqui pelo "Convidar" da barra lateral já quer
// adicionar alguém - abrir com o formulário pronto poupa o clique extra em
// "+ Convidar novo usuário" que quem só veio administrar (via Equipes) não precisa.
export default function UsersPanel({ onClose, initialShowCreate = false }) {
  const { t } = useTranslation();
  const { users, createUser, deleteUser, resetPassword, setRole, refresh: refreshUsers } = useUsers();
  const { user: currentUser } = useAuth();
  const showToast = useToast();

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(initialShowCreate);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetTargetId, setResetTargetId] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuAnchorRefs = useRef({});
  const createFormRef = useRef(null);
  const resetFormRef = useRef(null);

  // CNPJ da empresa: é o que quem pede acesso (tela de login, aba "Pedir acesso")
  // digita para achar essa empresa - por isso mora aqui, no mesmo lugar de onde se
  // administra quem entra.
  const [cnpjInput, setCnpjInput] = useState("");
  const [cnpjSaving, setCnpjSaving] = useState(false);
  const [cnpjError, setCnpjError] = useState("");
  const [joinRequests, setJoinRequests] = useState([]);
  const [resolvingRequestId, setResolvingRequestId] = useState(null);
  const [requestsOpen, setRequestsOpen] = useState(false);

  useEffect(() => {
    api.getMyCompany().then((c) => setCnpjInput(c.cnpj ? formatarDoc(c.cnpj) : ""));
    api
      .listJoinRequests()
      .then((reqs) => {
        setJoinRequests(reqs);
        // Pedido pendente já chega visível - só fica recolhido (atrás do badge)
        // quando não há nada esperando aprovação, pra não ocupar espaço à toa.
        if (reqs.length > 0) setRequestsOpen(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (showCreate) createFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [showCreate]);
  useEffect(() => {
    if (resetTargetId) resetFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [resetTargetId]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);

  async function handleSaveCnpj(e) {
    e.preventDefault();
    setCnpjError("");
    setCnpjSaving(true);
    try {
      const saved = await api.setCompanyCnpj(normalizarDoc(cnpjInput));
      setCnpjInput(saved.cnpj ? formatarDoc(saved.cnpj) : "");
      showToast(t("users.companyCnpjSaved"));
    } catch (err) {
      setCnpjError(translateError(err, t));
    } finally {
      setCnpjSaving(false);
    }
  }

  async function handleApprove(reqId) {
    setResolvingRequestId(reqId);
    try {
      const novo = await api.approveJoinRequest(reqId);
      setJoinRequests((prev) => prev.filter((r) => r.id !== reqId));
      await refreshUsers();
      showToast(t("users.requestApprovedToast", { name: novo.name }));
    } catch (err) {
      alert(translateError(err, t));
    } finally {
      setResolvingRequestId(null);
    }
  }

  async function handleReject(reqId) {
    setResolvingRequestId(reqId);
    try {
      await api.rejectJoinRequest(reqId);
      setJoinRequests((prev) => prev.filter((r) => r.id !== reqId));
      showToast(t("users.requestRejectedToast"));
    } catch (err) {
      alert(translateError(err, t));
    } finally {
      setResolvingRequestId(null);
    }
  }

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

  // Liga/desliga o acesso ao módulo Financeiro para um membro. O master não
  // aparece com o toggle (acessa sempre) - a regra do master implícito mora no
  // servidor (publicUser.financeAccess), aqui só se reflete.
  async function handleToggleFinance(u) {
    try {
      await api.setFinanceAccess(u.id, !u.financeAccess);
      await refreshUsers();
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

  async function handleCopyEmail(emailAddr) {
    try {
      await navigator.clipboard.writeText(emailAddr);
      showToast(t("users.emailCopied"));
    } catch {
      // clipboard exige contexto seguro; o e-mail já está visível na linha
      // para copiar à mão quando isso falha.
    }
  }

  const resetTargetUser = users.find((u) => u.id === resetTargetId);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-wide users-panel-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>
        <div className="modal-header users-panel-header">
          <h2 className="members-modal-title">{t("users.title")}</h2>
          <div className="search-box users-panel-search">
            <SearchIcon />
            <input
              type="text"
              placeholder={t("users.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-body users-panel-body">
          <div className="users-settings-card">
            <form className="users-settings-cnpj" onSubmit={handleSaveCnpj}>
              <div className="users-settings-cnpj-head">
                <label className="modal-label">{t("users.companyCnpjLabel")}</label>
                {cnpjInput && (
                  <span className="plan-status-pill status-active">
                    <span className="plan-status-pill-dot" />
                    {t("users.companyCnpjActive")}
                  </span>
                )}
              </div>
              <div className="company-cnpj-form">
                <input
                  type="text"
                  className="modal-date"
                  inputMode="numeric"
                  value={cnpjInput}
                  onChange={(e) => setCnpjInput(formatarDoc(e.target.value))}
                />
                <button type="submit" className="btn-secondary btn-small" disabled={cnpjSaving}>
                  {t("users.companyCnpjSave")}
                </button>
              </div>
              <p className="company-cnpj-hint">{t("users.companyCnpjHint")}</p>
              {cnpjError && <div className="auth-error">{cnpjError}</div>}
            </form>

            <button
              type="button"
              className="users-requests-toggle"
              onClick={() => setRequestsOpen((o) => !o)}
              aria-expanded={requestsOpen}
            >
              <span>{t("users.joinRequestsTitle")}</span>
              <span className={"users-requests-count" + (joinRequests.length > 0 ? " has-pending" : "")}>
                {joinRequests.length}
              </span>
              <span className={"users-requests-chevron" + (requestsOpen ? " open" : "")}>
                <ChevronDownIcon />
              </span>
            </button>
          </div>

          {requestsOpen && (
            <div className="join-requests-panel">
              {joinRequests.length === 0 ? (
                <p className="company-cnpj-hint">{t("users.joinRequestsEmpty")}</p>
              ) : (
                <ul className="join-requests-list">
                  {joinRequests.map((r) => (
                    <li key={r.id} className="join-requests-row">
                      <div className="join-requests-info">
                        <span className="join-requests-name">{r.name}</span>
                        <span className="join-requests-email">{r.email}</span>
                      </div>
                      <div className="join-requests-actions">
                        <button
                          className="btn-primary btn-small"
                          disabled={resolvingRequestId === r.id}
                          onClick={() => handleApprove(r.id)}
                        >
                          {t("users.approve")}
                        </button>
                        <button
                          className="btn-ghost btn-small"
                          disabled={resolvingRequestId === r.id}
                          onClick={() => handleReject(r.id)}
                        >
                          {t("users.reject")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="users-panel-columns" role="row">
            <span>{t("users.colMember")}</span>
            <span>{t("users.colEmail")}</span>
            <span>{t("users.colRole")}</span>
            <span>{t("users.colFinance")}</span>
            <span />
          </div>
          <div className="users-panel-list">
            {filteredUsers.map((u) => (
              <div className="users-panel-row" key={u.id}>
                <div className="users-row-member">
                  <Avatar id={u.id} name={u.name} avatarUrl={u.avatarUrl} className="avatar-small" />
                  <span className="users-row-name" title={u.name}>
                    {u.name}
                    {u.id === currentUser.id && <span className="users-table-you">{t("users.you")}</span>}
                  </span>
                </div>

                <button
                  type="button"
                  className="users-row-email"
                  onClick={() => handleCopyEmail(u.email)}
                  title={t("users.copyEmailHint")}
                >
                  <span className="users-row-email-text">{u.email}</span>
                  <CopyIcon />
                </button>

                <div className="users-row-role">
                  {u.role === "master" ? (
                    <span className="role-badge master">{t("users.roleMaster")}</span>
                  ) : (
                    <select
                      className="share-role-select"
                      value={u.role}
                      onChange={(e) => {
                        if (e.target.value === "master") handleMakeMaster(u);
                      }}
                    >
                      <option value="member">{t("users.roleMember")}</option>
                      <option value="master">{t("users.roleMaster")}</option>
                    </select>
                  )}
                </div>

                <div className="users-row-finance">
                  {u.role === "master" ? (
                    <span className="finance-access-always">{t("users.financeAlways")}</span>
                  ) : (
                    <label className="addon-toggle" title={t("users.financeAccessHint")}>
                      <input type="checkbox" checked={!!u.financeAccess} onChange={() => handleToggleFinance(u)} />
                      <span className="addon-toggle-track">
                        <span className="addon-toggle-thumb" />
                      </span>
                    </label>
                  )}
                </div>

                <div className="users-row-actions">
                  {u.role !== "master" && (
                    <>
                      <button
                        type="button"
                        ref={(el) => {
                          menuAnchorRefs.current[u.id] = el;
                        }}
                        className="row-menu-btn"
                        onClick={() => setOpenMenuId((cur) => (cur === u.id ? null : u.id))}
                        aria-label={t("users.rowActions")}
                      >
                        <KebabIcon />
                      </button>
                      {openMenuId === u.id && (
                        <UserActionsMenu
                          anchorEl={menuAnchorRefs.current[u.id]}
                          onClose={() => setOpenMenuId(null)}
                          onResetPassword={() => {
                            setOpenMenuId(null);
                            setResetTargetId(u.id);
                            setResetPasswordValue("");
                          }}
                          onMakeMaster={() => {
                            setOpenMenuId(null);
                            handleMakeMaster(u);
                          }}
                          onDelete={() => {
                            setOpenMenuId(null);
                            handleDelete(u);
                          }}
                          t={t}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {resetTargetId && (
            <form className="users-reset-form users-inline-panel" onSubmit={handleResetSubmit} ref={resetFormRef}>
              <label className="auth-field">
                <span>{t("users.newPasswordFor", { name: resetTargetUser?.name })}</span>
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

          {showCreate && (
            <form className="users-create-form users-inline-panel" onSubmit={handleCreate} ref={createFormRef}>
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
          )}
        </div>

        <div className="modal-footer modal-footer-split users-panel-footer">
          <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
            <PlusIcon /> {t("users.newUser")}
          </button>
          <span className="users-panel-total">{t("users.totalMembers", { count: users.length })}</span>
        </div>
      </div>
    </div>
  );
}
