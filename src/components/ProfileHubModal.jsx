import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { useUsers } from "../state/UsersContext.jsx";
import { useBoardState } from "../state/BoardContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import * as api from "../state/api.js";
import Avatar from "./Avatar.jsx";
import { MEMBER_COLORS, colorForUser } from "../utils/members.js";
import { BACKGROUND_COLORS } from "../utils/backgrounds.js";

const VIEWS = ["board", "table", "calendar", "dashboard", "map", "matrix"];

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Central de Perfil - substitui o antigo ProfileModal.jsx simples (nome/foto/
// bio) em TODOS os módulos: AccountMenu.jsx usa este componente sozinho
// agora, e é o mesmo que ModuleLauncher.jsx abre pelo item "Perfil" da
// sidebar do Hub. Nasceu dentro do Kanban (ver histórico), mas "Minhas
// Tarefas & Métricas"/"Preferências do Quadro" continuam fazendo sentido
// vistas de qualquer módulo: BoardProvider (App.jsx) envolve a plataforma
// inteira, não só o Kanban, então useBoardState() já tinha os cartões da
// pessoa carregados de qualquer tela - "Quadro" aqui sempre significa o
// Kanban, único módulo com esse conceito, então o rótulo não confunde
// ninguém mesmo aberto de dentro do ERP IRES ou do Xaphires Beauty.
// Métricas/atividade vêm do próprio BoardContext já carregado (sem
// requisição nova); apelido/cor/preferências de quadro moram em users.prefs
// (ver server/repo.js updateProfilePrefs) - um JSON por usuário, não uma
// tabela nova, porque é preferência solta, sem relação com nada além de
// quem é dono dela.
export default function ProfileHubModal({ onClose }) {
  const { t } = useTranslation();
  const { user, applyProfileUpdate, logout } = useAuth();
  const { refresh: refreshUsers } = useUsers();
  const boardState = useBoardState();
  const showToast = useToast();
  const fileInputRef = useRef(null);

  const [aba, setAba] = useState("geral");

  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || "");
  const [nickname, setNickname] = useState(user.prefs?.nickname || "");
  const [badgeColor, setBadgeColor] = useState(user.prefs?.badgeColor || "");
  const [savingGeral, setSavingGeral] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [erroGeral, setErroGeral] = useState("");

  const [defaultView, setDefaultView] = useState(user.prefs?.defaultView || "board");
  const [notifyMention, setNotifyMention] = useState(user.prefs?.notifyMention !== false);
  const [notifyAssignment, setNotifyAssignment] = useState(user.prefs?.notifyAssignment !== false);
  const [notifyDeadline, setNotifyDeadline] = useState(user.prefs?.notifyDeadline !== false);
  const [defaultBoardBackground, setDefaultBoardBackground] = useState(user.prefs?.defaultBoardBackground || "");
  const [personalMeetingProvider, setPersonalMeetingProvider] = useState(user.prefs?.personalMeetingProvider || "zoom");
  const [personalMeetingLink, setPersonalMeetingLink] = useState(user.prefs?.personalMeetingLink || "");
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [erroSenha, setErroSenha] = useState("");
  const [savingSenha, setSavingSenha] = useState(false);

  function aplicarLocal(updated) {
    applyProfileUpdate(updated);
    refreshUsers();
  }

  async function salvarGeral(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setErroGeral(t("errors.NAME_REQUIRED"));
      return;
    }
    setSavingGeral(true);
    setErroGeral("");
    try {
      await api.updateMyProfile({ name: trimmed, bio });
      const atualizado = await api.updateMyProfilePrefs({ nickname: nickname.trim(), badgeColor });
      aplicarLocal(atualizado);
      showToast(t("app.accountMenu.profileSavedToast"));
    } catch (err) {
      setErroGeral(translateError(err, t));
    } finally {
      setSavingGeral(false);
    }
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const atualizado = await api.uploadMyAvatar(file);
      aplicarLocal(atualizado);
    } catch (err) {
      setErroGeral(translateError(err, t));
    } finally {
      setUploadingPhoto(false);
    }
  }
  async function handleRemovePhoto() {
    setUploadingPhoto(true);
    try {
      const atualizado = await api.removeMyAvatar();
      aplicarLocal(atualizado);
    } catch (err) {
      setErroGeral(translateError(err, t));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function salvarPrefs(e) {
    e.preventDefault();
    const link = personalMeetingLink.trim();
    if (link && !/^https:\/\//i.test(link)) {
      showToast(t("errors.VIDEO_LINK_INVALID"));
      return;
    }
    setSavingPrefs(true);
    try {
      const atualizado = await api.updateMyProfilePrefs({
        defaultView,
        notifyMention,
        notifyAssignment,
        notifyDeadline,
        defaultBoardBackground,
        personalMeetingLink: link,
        personalMeetingProvider,
      });
      aplicarLocal(atualizado);
      showToast(t("app.profileHub.preferencias.salvo"));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSavingPrefs(false);
    }
  }

  async function submitChangePassword(e) {
    e.preventDefault();
    setErroSenha("");
    setSavingSenha(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      showToast(t("app.accountMenu.passwordChangedToast"));
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setErroSenha(translateError(err, t));
    } finally {
      setSavingSenha(false);
    }
  }

  // Métricas + atividade recente: derivadas do workspace já carregado em
  // memória (useBoardState), sem requisição nova. "Atrasada" compara `due`
  // (data civil) com hoje; card sem `due` nunca conta como atrasado.
  const { total, concluidas, atrasadas, andamento, atividades } = useMemo(() => {
    const hoje = hojeCivil();
    let total = 0, concluidas = 0, atrasadas = 0, andamento = 0;
    const eventos = [];
    for (const board of boardState.boards) {
      const listaDoCard = {};
      board.lists.forEach((l) => l.cardIds.forEach((cid) => { listaDoCard[cid] = l.title; }));
      for (const card of Object.values(board.cards)) {
        if (card.archived || !card.memberIds.includes(user.id)) continue;
        total++;
        if (card.completed) concluidas++;
        else if (card.due && card.due < hoje) atrasadas++;
        else andamento++;

        if (card.completed && card.completedAt) {
          eventos.push({ tipo: "concluido", quando: card.completedAt, titulo: card.title });
        } else if (card.listEnteredAt && card.listEnteredAt !== card.createdAt) {
          eventos.push({ tipo: "movido", quando: card.listEnteredAt, titulo: card.title, lista: listaDoCard[card.id] });
        } else if (card.createdAt) {
          eventos.push({ tipo: "criado", quando: card.createdAt, titulo: card.title });
        }
      }
    }
    eventos.sort((a, b) => (b.quando || "").localeCompare(a.quando || ""));
    return { total, concluidas, atrasadas, andamento, atividades: eventos.slice(0, 6) };
  }, [boardState.boards, user.id]);

  const roleLabel = user.role === "master" ? t("app.profileHub.roleMaster") : t("app.profileHub.roleMember");

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-wide profile-hub-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        <div className="profile-hub-head">
          <div className="profile-hub-avatar">
            <Avatar id={user.id} name={name} avatarUrl={user.avatarUrl} className="avatar-large" style={{ background: badgeColor || colorForUser(user.id) }} />
            <span className="profile-hub-online-dot" title={t("app.profileHub.online")} />
            <button type="button" className="profile-hub-avatar-edit" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto} title={t("app.accountMenu.uploadPhoto")}>
              <svg viewBox="0 0 24 24" width="13" height="13"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m4 20 1-4L18 3l3 3L8 19l-4 1zM14 6l4 4" /></svg>
            </button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={handlePhotoChange} />
          </div>
          <div>
            <h2 className="profile-hub-name">{user.name}</h2>
            <p className="profile-hub-muted" style={{ margin: 0 }}>{user.email}</p>
            <span className="profile-hub-role-badge">{roleLabel}</span>
          </div>
          {/* Único ponto de logout que o Hub (ModuleLauncher) enxerga - lá o item
              "Perfil" da sidebar abre este modal direto, sem o dropdown que
              AccountMenu.jsx tem nos outros módulos. Reaparece redundante ali
              (o dropdown já tem "Sair"), mas é o único caminho no Hub. */}
          <button type="button" className="btn-danger profile-hub-logout" onClick={logout}>
            {t("app.accountMenu.logout")}
          </button>
        </div>

        <div className="profile-hub-tabs">
          <button type="button" className={"profile-hub-tab" + (aba === "geral" ? " active" : "")} onClick={() => setAba("geral")}>{t("app.profileHub.tabs.geral")}</button>
          <button type="button" className={"profile-hub-tab" + (aba === "metricas" ? " active" : "")} onClick={() => setAba("metricas")}>{t("app.profileHub.tabs.metricas")}</button>
          <button type="button" className={"profile-hub-tab" + (aba === "preferencias" ? " active" : "")} onClick={() => setAba("preferencias")}>{t("app.profileHub.tabs.preferencias")}</button>
          <button type="button" className={"profile-hub-tab" + (aba === "seguranca" ? " active" : "")} onClick={() => setAba("seguranca")}>{t("app.profileHub.tabs.seguranca")}</button>
        </div>

        <div className="modal-body">
          {aba === "geral" && (
            <form className="profile-form" onSubmit={salvarGeral}>
              {user.avatarUrl && (
                <button type="button" className="btn-ghost btn-small" disabled={uploadingPhoto} onClick={handleRemovePhoto} style={{ alignSelf: "flex-start" }}>
                  {t("app.accountMenu.removePhoto")}
                </button>
              )}
              <label className="auth-field">
                <span>{t("app.accountMenu.profileName")}</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="auth-field">
                <span>{t("app.profileHub.geral.nickname")}</span>
                <input type="text" placeholder={t("app.profileHub.geral.nicknamePlaceholder")} value={nickname} onChange={(e) => setNickname(e.target.value)} />
              </label>
              <label className="auth-field">
                <span className="profile-bio-label-row">
                  {t("app.accountMenu.profileBio")}
                  <span className="profile-bio-count">{bio.length}/{api.MAX_BIO_LENGTH}</span>
                </span>
                <textarea
                  className="profile-bio-input"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, api.MAX_BIO_LENGTH))}
                  maxLength={api.MAX_BIO_LENGTH}
                  rows={3}
                  placeholder={t("app.accountMenu.profileBioPlaceholder")}
                />
              </label>
              <div className="auth-field">
                <span>{t("app.profileHub.geral.badgeColor")}</span>
                <div className="profile-hub-swatches">
                  {MEMBER_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      className={"profile-hub-swatch" + (badgeColor === c ? " active" : "")}
                      style={{ background: c }}
                      onClick={() => setBadgeColor(c)}
                      aria-label={c}
                    />
                  ))}
                </div>
                <p className="profile-hub-note">{t("app.profileHub.geral.badgeColorNote")}</p>
              </div>
              {erroGeral && <div className="auth-error">{erroGeral}</div>}
              <div className="composer-actions">
                <button type="submit" className="btn-primary btn-small" disabled={savingGeral}>
                  {savingGeral ? t("common.loading") : t("app.accountMenu.save")}
                </button>
              </div>
            </form>
          )}

          {aba === "metricas" && (
            <>
              <div className="profile-hub-kpi-grid">
                <div className="profile-hub-kpi-card">
                  <span className="dash-kpi-value">{total}</span>
                  <span className="dash-kpi-label">{t("app.profileHub.metricas.total")}</span>
                </div>
                <div className="profile-hub-kpi-card">
                  <span className="dash-kpi-value">{concluidas}</span>
                  <span className="dash-kpi-label">{t("app.profileHub.metricas.concluidas")}</span>
                </div>
                <div className="profile-hub-kpi-card">
                  <span className="dash-kpi-value">{andamento}</span>
                  <span className="dash-kpi-label">{t("app.profileHub.metricas.andamento")}</span>
                </div>
                <div className="profile-hub-kpi-card">
                  <span className="dash-kpi-value" style={atrasadas > 0 ? { color: "var(--danger)" } : undefined}>{atrasadas}</span>
                  <span className="dash-kpi-label">{t("app.profileHub.metricas.atrasadas")}</span>
                </div>
              </div>

              <h3 className="profile-hub-section-title">{t("app.profileHub.metricas.atividadeTitulo")}</h3>
              {atividades.length === 0 ? (
                <p className="profile-hub-muted">{t("app.profileHub.metricas.atividadeVazia")}</p>
              ) : (
                <ul className="dash-activity-list">
                  {atividades.map((ev, i) => (
                    <li className="dash-activity-item" key={i}>
                      <span className="dash-activity-dot" aria-hidden="true" />
                      <span className="dash-activity-text">
                        <strong>{ev.titulo}</strong> ·{" "}
                        {ev.tipo === "concluido"
                          ? t("app.profileHub.metricas.eventoConcluido")
                          : ev.tipo === "movido"
                          ? t("app.profileHub.metricas.eventoMovido", { lista: ev.lista || "" })
                          : t("app.profileHub.metricas.eventoCriado")}
                      </span>
                      <span className="dash-activity-time">{new Date(ev.quando).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {aba === "preferencias" && (
            <form onSubmit={salvarPrefs}>
              <label className="auth-field">
                <span>{t("app.profileHub.preferencias.exibicaoPadrao")}</span>
                <select value={defaultView} onChange={(e) => setDefaultView(e.target.value)}>
                  {VIEWS.map((v) => (
                    <option key={v} value={v}>{t(`app.profileHub.preferencias.view${v[0].toUpperCase()}${v.slice(1)}`)}</option>
                  ))}
                </select>
              </label>

              <h3 className="profile-hub-section-title">{t("app.profileHub.preferencias.avisosTitulo")}</h3>
              <label className="profile-hub-checkbox-row">
                <input type="checkbox" checked={notifyAssignment} onChange={(e) => setNotifyAssignment(e.target.checked)} />
                {t("app.profileHub.preferencias.avisoAtribuicao")}
              </label>
              <label className="profile-hub-checkbox-row">
                <input type="checkbox" checked={notifyMention} onChange={(e) => setNotifyMention(e.target.checked)} />
                {t("app.profileHub.preferencias.avisoMencao")}
              </label>
              <label className="profile-hub-checkbox-row">
                <input type="checkbox" checked={notifyDeadline} onChange={(e) => setNotifyDeadline(e.target.checked)} />
                {t("app.profileHub.preferencias.avisoPrazo")}
              </label>
              <p className="profile-hub-note">{t("app.profileHub.preferencias.avisosNota")}</p>

              <div className="auth-field" style={{ marginTop: 14 }}>
                <span>{t("app.profileHub.preferencias.corQuadro")}</span>
                <div className="profile-hub-swatches">
                  {BACKGROUND_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className={"profile-hub-swatch" + (defaultBoardBackground === c.css ? " active" : "")}
                      style={{ background: c.css }}
                      onClick={() => setDefaultBoardBackground(c.css)}
                      aria-label={c.id}
                    />
                  ))}
                </div>
                <p className="profile-hub-note">{t("app.profileHub.preferencias.corQuadroNota")}</p>
              </div>

              <h3 className="profile-hub-section-title">{t("app.profileHub.preferencias.reuniaoTitulo")}</h3>
              <div className="video-link-prefs-row">
                <select
                  className="video-link-provider-select"
                  value={personalMeetingProvider}
                  onChange={(e) => setPersonalMeetingProvider(e.target.value)}
                >
                  <option value="zoom">{t("planner.video.providerZoom")}</option>
                  <option value="meet">{t("planner.video.providerMeet")}</option>
                  <option value="teams">{t("planner.video.providerTeams")}</option>
                  <option value="custom">{t("planner.video.providerCustom")}</option>
                </select>
                <input
                  type="url"
                  className="video-link-input"
                  placeholder={t("app.profileHub.preferencias.reuniaoLinkPlaceholder")}
                  value={personalMeetingLink}
                  onChange={(e) => setPersonalMeetingLink(e.target.value)}
                />
              </div>
              <p className="profile-hub-note">{t("app.profileHub.preferencias.reuniaoNota")}</p>

              <div className="composer-actions" style={{ marginTop: 16 }}>
                <button type="submit" className="btn-primary btn-small" disabled={savingPrefs}>
                  {savingPrefs ? t("common.loading") : t("app.profileHub.preferencias.salvar")}
                </button>
              </div>
            </form>
          )}

          {aba === "seguranca" && (
            <>
              <h3 className="profile-hub-section-title">{t("app.accountMenu.changePassword")}</h3>
              <form className="account-password-form" onSubmit={submitChangePassword} style={{ maxWidth: 320 }}>
                <input
                  type="password"
                  placeholder={t("app.accountMenu.currentPassword")}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder={t("app.accountMenu.newPassword")}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
                {erroSenha && <div className="auth-error">{erroSenha}</div>}
                <div className="composer-actions">
                  <button type="submit" className="btn-primary btn-small" disabled={savingSenha}>
                    {savingSenha ? t("common.loading") : t("app.accountMenu.save")}
                  </button>
                </div>
              </form>

              <h3 className="profile-hub-section-title" style={{ marginTop: 24 }}>{t("app.profileHub.seguranca.sessoesTitulo")}</h3>
              <p className="profile-hub-muted">{t("app.profileHub.seguranca.sessoesIndisponivel")}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
