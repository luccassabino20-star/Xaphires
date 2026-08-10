import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import DatePicker from "./DatePicker.jsx";
import Avatar from "./Avatar.jsx";

function QuickCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
    </svg>
  );
}
function QuickRemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41 6.3 6.3-6.3 6.3 1.41 1.41 6.3-6.3 6.3 6.3 1.41-1.41-6.3-6.3 6.3-6.3z" />
    </svg>
  );
}
function UrgentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="currentColor" d="M5 3v18h2v-7h10.5l-2.5-4 2.5-4H7V3z" />
    </svg>
  );
}
function ImportantIcon() {
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

// Card de subtarefa no quadro (accordion do CardItem) - mesma estrutura
// visual do card principal (card-title-row / card-footer-row / avatars) e,
// diferente da versão só-leitura anterior, com as mesmas opções de edição
// rápida que a linha de subtarefa já tinha dentro do modal (SubtaskItem.jsx):
// prioridade (urgente/importante, o mesmo par do card principal), prazo via
// DatePicker compacto e responsável via seletor. onOpen (abrir o card pai)
// só dispara fora dessas áreas - cada controle para a propagação.
export default function SubtaskCard({ subtask, members, readOnly, onOpen, onToggleDone, onRemove, onUpdate }) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCoords, setPickerCoords] = useState(null);
  const avatarBtnRef = useRef(null);
  const pickerRef = useRef(null);
  const assignee = subtask.assigneeId ? members.find((m) => m.id === subtask.assigneeId) : null;

  // Picker por portal em document.body, mesmo motivo do popover do DatePicker
  // e do dropdown de ações do card: a coluna do quadro rola com overflow, e
  // um picker relativo ao botão ficaria cortado perto do fim da lista.
  const PICKER_WIDTH = 190;
  useLayoutEffect(() => {
    if (!pickerOpen) return;
    const rect = avatarBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(rect.right - PICKER_WIDTH, window.innerWidth - PICKER_WIDTH - 8);
    setPickerCoords({ top: rect.bottom + 4, left: Math.max(left, 8) });
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    function onDocClick(e) {
      if (avatarBtnRef.current?.contains(e.target)) return;
      if (pickerRef.current?.contains(e.target)) return;
      setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pickerOpen]);

  return (
    <div className={"card subtask-card" + (subtask.done ? " completed" : "")} onClick={onOpen}>
      {!readOnly && (
        <div className="quick-actions-bar" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="quick-action-btn"
            title={subtask.done ? t("board.cardModal.markIncomplete") : t("board.cardModal.markComplete")}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
          >
            <QuickCheckIcon />
          </button>
          <button
            type="button"
            className="quick-action-btn"
            title={t("common.remove")}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <QuickRemoveIcon />
          </button>
        </div>
      )}

      <div className="card-title-row">
        <div className="card-title-text">{subtask.title}</div>
      </div>

      <div className="card-footer-row" onClick={(e) => e.stopPropagation()}>
        <div className="card-meta">
          <button
            type="button"
            className={"subtask-priority-btn" + (subtask.urgent ? " active-urgent" : "")}
            disabled={readOnly}
            title={t("board.cardItem.urgent")}
            onClick={() => onUpdate({ urgent: !subtask.urgent })}
          >
            <UrgentIcon />
          </button>
          <button
            type="button"
            className={"subtask-priority-btn" + (subtask.important ? " active-important" : "")}
            disabled={readOnly}
            title={t("board.cardItem.important")}
            onClick={() => onUpdate({ important: !subtask.important })}
          >
            <ImportantIcon />
          </button>
          <DatePicker
            compact
            value={subtask.dueDate}
            onChange={(iso) => onUpdate({ dueDate: iso })}
            label={t("board.cardModal.dueDate")}
            disabled={readOnly}
          />
        </div>

        <div className="card-avatars">
          <button
            type="button"
            className="subtask-avatar-btn"
            ref={avatarBtnRef}
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
          {pickerOpen &&
            pickerCoords &&
            createPortal(
              <div
                className="subtask-card-member-picker"
                ref={pickerRef}
                style={{ top: pickerCoords.top, left: pickerCoords.left }}
              >
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
                {members.map((u) => (
                  <label key={u.id} className="member-picker-row">
                    <input
                      type="radio"
                      name={`subtask-card-assignee-${subtask.id}`}
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
              </div>,
              document.body
            )}
        </div>
      </div>
    </div>
  );
}
