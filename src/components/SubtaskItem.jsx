import { useState } from "react";
import { useTranslation } from "react-i18next";
import DatePicker from "./DatePicker.jsx";
import Avatar from "./Avatar.jsx";

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="currentColor" d="M5 3v18h2v-7h10.5l-2.5-4 2.5-4H7V3z" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="currentColor" d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}
function AssigneeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5z" />
    </svg>
  );
}

// Uma linha de subtarefa: checkbox + título à esquerda, badges compactos à
// direita (responsável, prazo, urgência) + remover. Cada badge só grava
// quando muda - onUpdate manda um patch parcial (ver UPDATE_SUBTASK no
// reducer), não a subtarefa inteira, pra um clique no prazo não pisar em cima
// de uma edição de responsável que ainda não sincronizou.
export default function SubtaskItem({ subtask, users, readOnly, onToggle, onUpdate, onRemove }) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const assignee = users.find((u) => u.id === subtask.assigneeId);

  return (
    <li className={"subtask-row" + (subtask.done ? " done" : "")}>
      <button
        type="button"
        className={"subtask-check" + (subtask.done ? " checked" : "")}
        disabled={readOnly}
        onClick={onToggle}
        aria-label={subtask.done ? t("board.cardModal.markIncomplete") : t("board.cardModal.markComplete")}
      >
        {subtask.done && (
          <svg viewBox="0 0 24 24" width="11" height="11">
            <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
          </svg>
        )}
      </button>

      <span className="subtask-title">{subtask.title}</span>

      <div className="subtask-badges">
        <button
          type="button"
          className={"subtask-flag-btn subtask-flag-urgent" + (subtask.urgent ? " active" : "")}
          disabled={readOnly}
          title={t("board.cardModal.urgent")}
          onClick={() => onUpdate({ urgent: !subtask.urgent })}
        >
          <FlagIcon />
        </button>

        <button
          type="button"
          className={"subtask-flag-btn subtask-flag-important" + (subtask.important ? " active" : "")}
          disabled={readOnly}
          title={t("board.cardModal.important")}
          onClick={() => onUpdate({ important: !subtask.important })}
        >
          <StarIcon />
        </button>

        <DatePicker
          compact
          value={subtask.dueDate}
          onChange={(iso) => onUpdate({ dueDate: iso })}
          label={t("board.cardModal.dueDate")}
          disabled={readOnly}
        />

        <div className="subtask-assignee">
          <button
            type="button"
            className="subtask-avatar-btn"
            disabled={readOnly}
            title={assignee ? assignee.name : t("board.cardModal.members")}
            onClick={() => setPickerOpen((o) => !o)}
          >
            {assignee ? (
              <Avatar id={assignee.id} name={assignee.name} avatarUrl={assignee.avatarUrl} className="avatar-small" />
            ) : (
              <AssigneeIcon />
            )}
          </button>
          {pickerOpen && (
            <div className="member-picker subtask-member-picker">
              {subtask.assigneeId && (
                <button
                  type="button"
                  className="member-picker-row"
                  onClick={() => {
                    onUpdate({ assigneeId: null });
                    setPickerOpen(false);
                  }}
                >
                  {t("board.cardModal.unassign")}
                </button>
              )}
              {users.map((u) => (
                <label key={u.id} className="member-picker-row">
                  <input
                    type="radio"
                    name={`subtask-assignee-${subtask.id}`}
                    checked={subtask.assigneeId === u.id}
                    onChange={() => {
                      onUpdate({ assigneeId: u.id });
                      setPickerOpen(false);
                    }}
                  />
                  <Avatar id={u.id} name={u.name} avatarUrl={u.avatarUrl} className="avatar-small" />
                  <span>{u.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {!readOnly && (
          <button type="button" className="subtask-remove" onClick={onRemove} aria-label={t("common.remove")}>
            &times;
          </button>
        )}
      </div>
    </li>
  );
}
