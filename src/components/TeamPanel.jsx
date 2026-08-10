import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUsers } from "../state/UsersContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { useChat } from "../state/ChatContext.jsx";
import { translateError } from "../utils/errors.js";
import Avatar from "./Avatar.jsx";

// Painel de equipe: aberto para qualquer papel (diferente do UsersPanel, que é
// administração e continua master-only). Mostra todo mundo da empresa com duas
// ações por linha - perfil e mensagem direta (a mesma conversa que o "+ Nova
// conversa" do ChatModal cria; ver getOrCreateDirectConversation no servidor,
// que é idempotente, então reabrir uma conversa existente não duplica nada).
export default function TeamPanel({ onClose, onManageUsers }) {
  const { t } = useTranslation();
  const { users } = useUsers();
  const { user: currentUser } = useAuth();
  const { startConversation, openChat } = useChat();
  const [profileUser, setProfileUser] = useState(null);
  const [messagingId, setMessagingId] = useState(null);

  async function handleMessage(u) {
    setMessagingId(u.id);
    try {
      await startConversation(u.id);
      openChat();
      onClose();
    } catch (err) {
      alert(translateError(err, t));
    } finally {
      setMessagingId(null);
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
          <h2 className="members-modal-title">{t("team.title")}</h2>
        </div>
        <div className="modal-body">
          {profileUser ? (
            <div className="team-profile">
              <Avatar id={profileUser.id} name={profileUser.name} avatarUrl={profileUser.avatarUrl} className="avatar-large" />
              <h3 className="team-profile-name">
                {profileUser.name}
                {profileUser.id === currentUser.id && <span className="users-table-you">{t("users.you")}</span>}
              </h3>
              <span className={"role-badge" + (profileUser.role === "master" ? " master" : "")}>
                {profileUser.role === "master" ? t("users.roleMaster") : t("users.roleMember")}
              </span>
              <p className="team-profile-email">{profileUser.email}</p>
              {profileUser.bio && <p className="team-profile-bio">{profileUser.bio}</p>}
              <div className="composer-actions">
                {profileUser.id !== currentUser.id && (
                  <button
                    className="btn-primary btn-small"
                    disabled={messagingId === profileUser.id}
                    onClick={() => handleMessage(profileUser)}
                  >
                    {t("team.sendMessage")}
                  </button>
                )}
                <button className="btn-ghost btn-small" onClick={() => setProfileUser(null)}>
                  {t("team.back")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {currentUser.role === "master" && onManageUsers && (
                <button type="button" className="btn-ghost btn-small team-manage-link" onClick={onManageUsers}>
                  {t("team.manageUsers")}
                </button>
              )}
              <div className="users-table-wrap">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>{t("users.colName")}</th>
                      <th>{t("users.colRole")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <Avatar id={u.id} name={u.name} avatarUrl={u.avatarUrl} className="avatar-small" />
                        </td>
                        <td>
                          {u.name}
                          {u.id === currentUser.id && <span className="users-table-you">{t("users.you")}</span>}
                        </td>
                        <td>
                          <span className={"role-badge" + (u.role === "master" ? " master" : "")}>
                            {u.role === "master" ? t("users.roleMaster") : t("users.roleMember")}
                          </span>
                        </td>
                        <td className="users-table-actions">
                          <button className="btn-ghost btn-small" onClick={() => setProfileUser(u)}>
                            {t("team.viewProfile")}
                          </button>
                          {u.id !== currentUser.id && (
                            <button
                              className="btn-secondary btn-small"
                              disabled={messagingId === u.id}
                              onClick={() => handleMessage(u)}
                            >
                              {t("team.sendMessage")}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
