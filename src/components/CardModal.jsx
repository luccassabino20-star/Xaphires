import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch, useBoardState } from "../state/BoardContext.jsx";
import { useUsers } from "../state/UsersContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import { LABEL_COLORS } from "../utils/labels.js";
import { initials, colorForUser } from "../utils/members.js";
import { geocodeAddress, addLinkAttachment, addFileAttachment, removeCardAttachment, attachmentDownloadUrl } from "../state/api.js";

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function AttachmentFileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6z" />
    </svg>
  );
}
function AttachmentLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M3.9 12a4.1 4.1 0 0 1 4.1-4.1h4V6.1h-4a5.9 5.9 0 0 0 0 11.8h4v-1.8h-4A4.1 4.1 0 0 1 3.9 12zM8 13h8v-2H8zm8.1-6.9h-4v1.8h4a4.1 4.1 0 0 1 0 8.2h-4v1.8h4a5.9 5.9 0 0 0 0-11.8z" />
    </svg>
  );
}
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UrgentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M5 3v18h2v-7h10.5l-2.5-4 2.5-4H7V3z" />
    </svg>
  );
}
function ImportantIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
    </svg>
  );
}

export default function CardModal({ boardId, cardId, onClose }) {
  const { t } = useTranslation();
  const state = useBoardState();
  const dispatch = useBoardDispatch();
  const { users } = useUsers();
  const showToast = useToast();
  const board = state.boards.find((b) => b.id === boardId);
  const card = board?.cards[cardId];

  const [title, setTitle] = useState(card?.title || "");
  const [description, setDescription] = useState(card?.description || "");
  const [checklistText, setChecklistText] = useState("");
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [addressInput, setAddressInput] = useState(card?.location?.address || "");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [uploading, setUploading] = useState(false);
  const titleRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  if (!card) return null;

  function commitTitle() {
    const val = title.trim() || t("board.cardModal.untitled");
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { title: val } });
    setTitle(val);
  }
  function commitDescription() {
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { description } });
  }
  function handleDueChange(e) {
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { due: e.target.value || null } });
  }
  function handleStartDateChange(e) {
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { startDate: e.target.value || null } });
  }
  async function handleLocateAddress(e) {
    e.preventDefault();
    const q = addressInput.trim();
    if (!q) {
      dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { location: null } });
      return;
    }
    setGeocoding(true);
    setGeocodeError("");
    try {
      const result = await geocodeAddress(q);
      dispatch({
        type: "UPDATE_CARD",
        boardId,
        cardId,
        patch: { location: { address: q, lat: result.lat, lng: result.lng } },
      });
    } catch (err) {
      setGeocodeError(translateError(err, t));
      dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { location: { address: q, lat: null, lng: null } } });
    } finally {
      setGeocoding(false);
    }
  }
  function toggleCompleted() {
    dispatch({ type: "TOGGLE_CARD_COMPLETED", boardId, cardId });
  }
  function toggleUrgent() {
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { urgent: !card.urgent } });
  }
  function toggleImportant() {
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { important: !card.important } });
  }
  function toggleLabel(labelId) {
    dispatch({ type: "TOGGLE_CARD_LABEL", boardId, cardId, labelId });
  }
  function toggleMember(memberId) {
    dispatch({ type: "TOGGLE_CARD_MEMBER", boardId, cardId, memberId });
  }
  function addChecklistItem(e) {
    e.preventDefault();
    const val = checklistText.trim();
    if (!val) return;
    dispatch({ type: "ADD_CHECKLIST_ITEM", boardId, cardId, text: val });
    setChecklistText("");
  }
  function toggleChecklistItem(index) {
    dispatch({ type: "TOGGLE_CHECKLIST_ITEM", boardId, cardId, index });
  }
  function removeChecklistItem(index) {
    dispatch({ type: "REMOVE_CHECKLIST_ITEM", boardId, cardId, index });
  }
  function deleteCard() {
    if (!confirm(t("board.cardModal.deleteCardConfirm"))) return;
    dispatch({ type: "DELETE_CARD", boardId, cardId });
    showToast(t("board.cardModal.cardDeletedToast"));
    onClose();
  }
  // Arquivar não pede confirmação: é reversível pelo modal de arquivados,
  // diferente de excluir.
  function archiveCard() {
    dispatch({ type: "ARCHIVE_CARD", boardId, cardId, at: new Date().toISOString() });
    showToast(t("board.cardModal.cardArchivedToast"));
    onClose();
  }

  async function submitLinkAttachment(e) {
    e.preventDefault();
    const url = linkUrl.trim();
    if (!url) return;
    try {
      const { attachments } = await addLinkAttachment(cardId, { url, name: linkName.trim() });
      dispatch({ type: "SET_CARD_ATTACHMENTS", boardId, cardId, attachments });
      setLinkUrl("");
      setLinkName("");
      setLinkFormOpen(false);
      showToast(t("board.cardModal.attachmentAdded"));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function handleFilePicked(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      showToast(t("board.cardModal.attachmentTooLarge"));
      return;
    }
    setUploading(true);
    try {
      const dataBase64 = await readFileAsBase64(file);
      const { attachments } = await addFileAttachment(cardId, { name: file.name, mimeType: file.type, dataBase64 });
      dispatch({ type: "SET_CARD_ATTACHMENTS", boardId, cardId, attachments });
      showToast(t("board.cardModal.attachmentAdded"));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveAttachment(attachmentId) {
    try {
      const { attachments } = await removeCardAttachment(cardId, attachmentId);
      dispatch({ type: "SET_CARD_ATTACHMENTS", boardId, cardId, attachments });
      showToast(t("board.cardModal.attachmentRemoved"));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  const done = card.checklist.filter((i) => i.done).length;
  const pct = card.checklist.length ? Math.round((done / card.checklist.length) * 100) : 0;
  const cardMembers = (card.memberIds || []).map((id) => users.find((m) => m.id === id)).filter(Boolean);

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
          <svg viewBox="0 0 24 24" width="20" height="20" className="modal-icon">
            <path fill="currentColor" d="M3 5h18v2H3zm0 6h18v2H3zm0 6h12v2H3z" />
          </svg>
          <input
            ref={titleRef}
            className="modal-title-input"
            value={title}
            spellCheck={false}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>

        <div className="modal-body">
          <div className="modal-section">
            <button type="button" className={"card-complete-toggle-row" + (card.completed ? " checked" : "")} onClick={toggleCompleted}>
              <span className={"card-complete-check" + (card.completed ? " checked" : "")}>
                {card.completed && (
                  <svg viewBox="0 0 24 24" width="12" height="12">
                    <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                  </svg>
                )}
              </span>
              <span>{card.completed ? t("board.cardModal.complete") : t("board.cardModal.markComplete")}</span>
            </button>
          </div>

          <div className="modal-section">
            <label className="modal-label">{t("board.cardModal.members")}</label>
            <div className="member-avatars-row">
              {cardMembers.map((m) => (
                <span key={m.id} className="avatar" style={{ background: colorForUser(m.id) }} title={m.name}>
                  {initials(m.name)}
                </span>
              ))}
              <button type="button" className="avatar avatar-add" onClick={() => setMemberPickerOpen((o) => !o)}>
                +
              </button>
            </div>
            {memberPickerOpen && (
              <div className="member-picker">
                {users.length === 0 && <div className="member-picker-empty">{t("board.cardModal.noUsersYet")}</div>}
                {users.map((m) => (
                  <label key={m.id} className="member-picker-row">
                    <input type="checkbox" checked={(card.memberIds || []).includes(m.id)} onChange={() => toggleMember(m.id)} />
                    <span className="avatar avatar-small" style={{ background: colorForUser(m.id) }}>
                      {initials(m.name)}
                    </span>
                    <span>{m.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="modal-section">
            <label className="modal-label">{t("board.cardModal.labels")}</label>
            <div className="label-picker">
              {LABEL_COLORS.map((meta) => (
                <button
                  key={meta.id}
                  type="button"
                  className={"label-chip" + (card.labels.includes(meta.id) ? " active" : "")}
                  style={{ background: meta.color }}
                  onClick={() => toggleLabel(meta.id)}
                >
                  {card.labels.includes(meta.id) ? "✓" : ""}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-section">
            <label className="modal-label">{t("board.cardModal.priority")}</label>
            <div className="priority-toggle-row">
              <button
                type="button"
                className={"priority-chip priority-chip-urgent" + (card.urgent ? " active" : "")}
                onClick={toggleUrgent}
              >
                <UrgentIcon /> {t("board.cardModal.urgent")}
              </button>
              <button
                type="button"
                className={"priority-chip priority-chip-important" + (card.important ? " active" : "")}
                onClick={toggleImportant}
              >
                <ImportantIcon /> {t("board.cardModal.important")}
              </button>
            </div>
          </div>

          <div className="modal-section modal-section-row">
            <div>
              <label className="modal-label">{t("board.cardModal.startDate")}</label>
              <input type="date" className="modal-date" value={card.startDate || ""} onChange={handleStartDateChange} />
            </div>
            <div>
              <label className="modal-label">{t("board.cardModal.dueDate")}</label>
              <input type="date" className="modal-date" value={card.due || ""} onChange={handleDueChange} />
            </div>
          </div>

          <div className="modal-section">
            <label className="modal-label">{t("board.cardModal.location")}</label>
            <form className="location-form" onSubmit={handleLocateAddress}>
              <input
                type="text"
                className="modal-date location-input"
                placeholder={t("board.cardModal.addressPlaceholder")}
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
              />
              <button type="submit" className="btn-primary btn-small" disabled={geocoding}>
                {geocoding ? t("board.cardModal.locating") : t("board.cardModal.locate")}
              </button>
            </form>
            {geocodeError && <div className="auth-error" style={{ marginTop: 8 }}>{geocodeError}</div>}
            {card.location?.lat != null && (
              <div className="location-confirmed">
                <PinIcon /> {t("board.cardModal.locationFound")}
              </div>
            )}
            {card.location?.address && card.location?.lat == null && !geocoding && (
              <div className="location-pending">{t("board.cardModal.locationPending")}</div>
            )}
          </div>

          <div className="modal-section">
            <label className="modal-label">{t("board.cardModal.description")}</label>
            <textarea
              className="modal-textarea"
              placeholder={t("board.cardModal.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={commitDescription}
            />
          </div>

          <div className="modal-section">
            <label className="modal-label">{t("board.cardModal.checklist")}</label>
            {card.checklist.length > 0 && (
              <div className="checklist-progress">
                <div className="checklist-progress-bar">
                  <div className="checklist-progress-fill" style={{ width: pct + "%" }} />
                </div>
                <span>{pct}%</span>
              </div>
            )}
            <ul className="checklist">
              {card.checklist.map((item, idx) => (
                <li key={idx} className={"checklist-item" + (item.done ? " done" : "")}>
                  <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(idx)} />
                  <span>{item.text}</span>
                  <button type="button" className="checklist-item-remove" onClick={() => removeChecklistItem(idx)}>
                    &times;
                  </button>
                </li>
              ))}
            </ul>
            <form className="checklist-add" onSubmit={addChecklistItem}>
              <input
                type="text"
                placeholder={t("board.cardModal.addItemPlaceholder")}
                value={checklistText}
                onChange={(e) => setChecklistText(e.target.value)}
              />
              <button type="submit" className="btn-primary btn-small">
                {t("common.add")}
              </button>
            </form>
          </div>

          <div className="modal-section">
            <label className="modal-label">{t("board.cardModal.attachments")}</label>
            {card.attachments?.length > 0 && (
              <ul className="attachment-list">
                {card.attachments.map((a) => (
                  <li key={a.id} className="attachment-item">
                    {a.type === "file" ? <AttachmentFileIcon /> : <AttachmentLinkIcon />}
                    <a
                      href={a.type === "file" ? attachmentDownloadUrl(cardId, a.id) : a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="attachment-name"
                      title={a.name}
                    >
                      {a.name}
                    </a>
                    {a.type === "file" && a.size != null && <span className="attachment-size">{formatBytes(a.size)}</span>}
                    <button
                      type="button"
                      className="checklist-item-remove"
                      onClick={() => handleRemoveAttachment(a.id)}
                      aria-label={t("common.remove")}
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="attachment-actions">
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={handleFilePicked}
              />
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? t("board.cardModal.uploading") : t("board.cardModal.attachFile")}
              </button>
              <button type="button" className="btn-secondary btn-small" onClick={() => setLinkFormOpen((o) => !o)}>
                {t("board.cardModal.attachLink")}
              </button>
            </div>
            {linkFormOpen && (
              <form className="checklist-add" style={{ marginTop: 8, flexWrap: "wrap" }} onSubmit={submitLinkAttachment}>
                <input
                  type="text"
                  placeholder={t("board.cardModal.linkUrlPlaceholder")}
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  style={{ flex: "2 1 200px" }}
                />
                <input
                  type="text"
                  placeholder={t("board.cardModal.linkNamePlaceholder")}
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  style={{ flex: "1 1 140px" }}
                />
                <button type="submit" className="btn-primary btn-small">
                  {t("common.add")}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={archiveCard}>
            {t("board.cardModal.archiveCard")}
          </button>
          <button className="btn-danger" onClick={deleteCard}>
            {t("board.cardModal.deleteCard")}
          </button>
        </div>
      </div>
    </div>
  );
}
