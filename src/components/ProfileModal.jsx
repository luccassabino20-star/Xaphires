import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { useUsers } from "../state/UsersContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import * as api from "../state/api.js";
import Avatar from "./Avatar.jsx";

// "Meu perfil": as três únicas coisas que o próprio usuário edita sobre si
// mesmo (nome, foto, bio) - e-mail fica de fora de propósito, só master troca
// (ver comentário em routes/profile.js). Foto some/troca na hora, sem botão
// de salvar - nome/bio têm um Salvar próprio, porque são dois campos de texto
// que fazem mais sentido confirmados juntos.
export default function ProfileModal({ onClose }) {
  const { t } = useTranslation();
  const { user, applyProfileUpdate } = useAuth();
  const { refresh: refreshUsers } = useUsers();
  const showToast = useToast();
  const fileInputRef = useRef(null);

  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || "");
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState("");

  function aplicarLocal(updated) {
    applyProfileUpdate(updated);
    refreshUsers();
  }

  async function handleSave(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("errors.NAME_REQUIRED"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateMyProfile({ name: trimmed, bio });
      aplicarLocal(updated);
      showToast(t("app.accountMenu.profileSavedToast"));
    } catch (err) {
      setError(translateError(err, t));
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois
    if (!file) return;
    setUploadingPhoto(true);
    setError("");
    try {
      const updated = await api.uploadMyAvatar(file);
      aplicarLocal(updated);
    } catch (err) {
      setError(translateError(err, t));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleRemovePhoto() {
    setUploadingPhoto(true);
    setError("");
    try {
      const updated = await api.removeMyAvatar();
      aplicarLocal(updated);
    } catch (err) {
      setError(translateError(err, t));
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>
        <div className="modal-header">
          <h2 className="members-modal-title">{t("app.accountMenu.myProfile")}</h2>
        </div>
        <div className="modal-body">
          <div className="profile-photo-section">
            <Avatar id={user.id} name={name} avatarUrl={user.avatarUrl} className="avatar-large" />
            <div className="profile-photo-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={handlePhotoChange}
              />
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingPhoto ? t("common.loading") : t("app.accountMenu.uploadPhoto")}
              </button>
              {user.avatarUrl && (
                <button type="button" className="btn-ghost btn-small" disabled={uploadingPhoto} onClick={handleRemovePhoto}>
                  {t("app.accountMenu.removePhoto")}
                </button>
              )}
            </div>
          </div>

          <form className="profile-form" onSubmit={handleSave}>
            <label className="auth-field">
              <span>{t("app.accountMenu.profileName")}</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </label>
            <label className="auth-field">
              <span className="profile-bio-label-row">
                {t("app.accountMenu.profileBio")}
                <span className="profile-bio-count">
                  {bio.length}/{api.MAX_BIO_LENGTH}
                </span>
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
            {error && <div className="auth-error">{error}</div>}
            <div className="composer-actions">
              <button type="submit" className="btn-primary btn-small" disabled={saving}>
                {saving ? t("common.loading") : t("app.accountMenu.save")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
