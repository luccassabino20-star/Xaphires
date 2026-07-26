import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMinutes } from "../state/MinutesContext.jsx";
import { useUsers } from "../state/UsersContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import { uid } from "../utils/id.js";
import { initials, colorForUser } from "../utils/members.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function MinuteModal({ minuteId, onClose }) {
  const { t } = useTranslation();
  const { minutes, createMinute, updateMinute, deleteMinute } = useMinutes();
  const { users } = useUsers();
  const { user } = useAuth();
  const showToast = useToast();
  const isNew = !minuteId;
  const existing = isNew ? null : minutes.find((m) => m.id === minuteId);

  const [title, setTitle] = useState(existing?.title || "");
  const [date, setDate] = useState(existing?.date || todayIso());
  const [attendeeIds, setAttendeeIds] = useState(existing?.attendeeIds || []);
  const [agenda, setAgenda] = useState(existing?.agenda || "");
  const [decisions, setDecisions] = useState(existing?.decisions || "");
  const [actionItems, setActionItems] = useState(existing?.actionItems || []);
  const [actionText, setActionText] = useState("");
  const [attendeePickerOpen, setAttendeePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);

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

  if (!isNew && !existing) return null;

  const canEdit = isNew || existing.authorId === user.id || user.role === "master";

  function toggleAttendee(id) {
    setAttendeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function addActionItem(e) {
    e.preventDefault();
    const val = actionText.trim();
    if (!val) return;
    setActionItems((prev) => [...prev, { id: uid(), text: val, done: false, assigneeId: null }]);
    setActionText("");
  }
  function toggleActionItem(id) {
    setActionItems((prev) => prev.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
  }
  function removeActionItem(id) {
    setActionItems((prev) => prev.filter((it) => it.id !== id));
  }
  function setActionAssignee(id, assigneeId) {
    setActionItems((prev) => prev.map((it) => (it.id === id ? { ...it, assigneeId: assigneeId || null } : it)));
  }

  async function handleSave() {
    const val = title.trim();
    if (!val) return;
    setSaving(true);
    try {
      const payload = { title: val, date, attendeeIds, agenda, decisions, actionItems };
      if (isNew) {
        await createMinute(payload);
        showToast(t("minutes.modal.minuteCreatedToast"));
      } else {
        await updateMinute(minuteId, payload);
        showToast(t("minutes.modal.minuteUpdatedToast"));
      }
      onClose();
    } catch (err) {
      alert(translateError(err, t));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("minutes.modal.deleteConfirm"))) return;
    try {
      await deleteMinute(minuteId);
      showToast(t("minutes.modal.minuteDeletedToast"));
      onClose();
    } catch (err) {
      alert(translateError(err, t));
    }
  }

  const attendees = attendeeIds.map((id) => users.find((u) => u.id === id)).filter(Boolean);
  const authorId = isNew ? user.id : existing.authorId;
  const authorName = (isNew ? user.name : users.find((u) => u.id === existing.authorId)?.name) || "-";

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
            <path fill="currentColor" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM7 7h10v2H7zm0 4h10v2H7zm0 4h7v2H7z" />
          </svg>
          <input
            ref={titleRef}
            className="modal-title-input"
            placeholder={t("minutes.modal.titlePlaceholder")}
            value={title}
            spellCheck={false}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={!canEdit}
          />
        </div>

        <div className="modal-body">
          <div className="modal-section modal-section-row">
            <div>
              <label className="modal-label">{t("minutes.modal.date")}</label>
              <input type="date" className="modal-date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <label className="modal-label">{t("minutes.modal.author")}</label>
              <div className="minutes-author-tag">
                <span className="avatar avatar-small" style={{ background: colorForUser(authorId) }}>
                  {initials(authorName)}
                </span>
                {authorName}
              </div>
            </div>
          </div>

          <div className="modal-section">
            <label className="modal-label">{t("minutes.modal.participants")}</label>
            <div className="member-avatars-row">
              {attendees.map((m) => (
                <span key={m.id} className="avatar" style={{ background: colorForUser(m.id) }} title={m.name}>
                  {initials(m.name)}
                </span>
              ))}
              {canEdit && (
                <button type="button" className="avatar avatar-add" onClick={() => setAttendeePickerOpen((o) => !o)}>
                  +
                </button>
              )}
            </div>
            {attendeePickerOpen && canEdit && (
              <div className="member-picker">
                {users.length === 0 && <div className="member-picker-empty">{t("minutes.modal.noUsersYet")}</div>}
                {users.map((m) => (
                  <label key={m.id} className="member-picker-row">
                    <input type="checkbox" checked={attendeeIds.includes(m.id)} onChange={() => toggleAttendee(m.id)} />
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
            <label className="modal-label">{t("minutes.modal.agenda")}</label>
            <textarea
              className="modal-textarea"
              placeholder={t("minutes.modal.agendaPlaceholder")}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              readOnly={!canEdit}
            />
          </div>

          <div className="modal-section">
            <label className="modal-label">{t("minutes.modal.decisions")}</label>
            <textarea
              className="modal-textarea"
              placeholder={t("minutes.modal.decisionsPlaceholder")}
              value={decisions}
              onChange={(e) => setDecisions(e.target.value)}
              readOnly={!canEdit}
            />
          </div>

          <div className="modal-section">
            <label className="modal-label">{t("minutes.modal.actionItems")}</label>
            {actionItems.length > 0 && (
              <ul className="checklist">
                {actionItems.map((item) => (
                  <li key={item.id} className={"checklist-item" + (item.done ? " done" : "")}>
                    <input type="checkbox" checked={item.done} onChange={() => toggleActionItem(item.id)} disabled={!canEdit} />
                    <span>{item.text}</span>
                    <select
                      className="minutes-action-assignee"
                      value={item.assigneeId || ""}
                      onChange={(e) => setActionAssignee(item.id, e.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="">{t("minutes.modal.assignee")}</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                    {canEdit && (
                      <button type="button" className="checklist-item-remove" onClick={() => removeActionItem(item.id)}>
                        &times;
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <form className="checklist-add" onSubmit={addActionItem}>
                <input
                  type="text"
                  placeholder={t("minutes.modal.addActionPlaceholder")}
                  value={actionText}
                  onChange={(e) => setActionText(e.target.value)}
                />
                <button type="submit" className="btn-primary btn-small">
                  {t("common.add")}
                </button>
              </form>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="modal-footer modal-footer-split">
            {!isNew ? (
              <button className="btn-danger" onClick={handleDelete}>
                {t("minutes.modal.deleteMinute")}
              </button>
            ) : (
              <span />
            )}
            <button className="btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? t("minutes.modal.saving") : isNew ? t("minutes.modal.createMinute") : t("minutes.modal.saveChanges")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
