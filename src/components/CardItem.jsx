import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useBoardDispatch } from "../state/BoardContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { LABEL_COLORS } from "../utils/labels.js";
import { isStuck, hoursStuck, formatDuration } from "../utils/bottlenecks.js";
import { initials, colorForUser } from "../utils/members.js";
import { localeTag } from "../i18n/locale.js";
import { uid } from "../utils/id.js";
import SubtaskCard from "./SubtaskCard.jsx";

function formatDate(iso, lng) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString(localeTag(lng));
}

function isOverdue(iso, checklist) {
  if (!iso) return false;
  const allDone = checklist && checklist.length > 0 && checklist.every((i) => i.done);
  if (allDone) return false;
  return new Date(iso + "T23:59:59").getTime() < Date.now();
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm12 8v9H5v-9z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="currentColor" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-9 14-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z" />
    </svg>
  );
}
function DescIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="currentColor" d="M3 5h18v2H3zm0 6h18v2H3zm0 6h12v2H3z" />
    </svg>
  );
}
function AttachmentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="currentColor" d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6z" />
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
function QuickCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
    </svg>
  );
}
function QuickPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
    </svg>
  );
}
function QuickEditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zm17.71-10.04a1 1 0 0 0 0-1.41l-2.51-2.51a1 1 0 0 0-1.41 0l-1.96 1.96 3.75 3.75z" />
    </svg>
  );
}
function QuickMoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export default function CardItem({ card, list, boardId, members, searchQuery, memberFilter, onOpen, onOpenSubtask, readOnly, onDragStart, onDragEnd }) {
  const { t, i18n } = useTranslation();
  const dispatch = useBoardDispatch();
  const showToast = useToast();
  const matchesSearch = !searchQuery || card.title.toLowerCase().includes(searchQuery.toLowerCase());
  const matchesMemberFilter = !memberFilter || (card.memberIds || []).includes(memberFilter);
  const dimmed = !matchesSearch || !matchesMemberFilter;

  const hasDue = !!card.due;
  const hasChecklist = card.checklist && card.checklist.length > 0;
  const hasDesc = !!(card.description && card.description.trim());
  const hasAttachments = card.attachments && card.attachments.length > 0;
  const cardMembers = (card.memberIds || []).map((id) => members.find((m) => m.id === id)).filter(Boolean);
  const subtasks = card.subtasks || [];
  const hasSubtasks = subtasks.length > 0;

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState(null);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const moreBtnRef = useRef(null);
  const dropdownRef = useRef(null);

  function toggleCompleted(e) {
    e.stopPropagation();
    dispatch({ type: "TOGGLE_CARD_COMPLETED", boardId, cardId: card.id });
  }
  function handleOpenSubtask(e) {
    e.stopPropagation();
    onOpenSubtask();
  }
  function handleEdit(e) {
    e.stopPropagation();
    onOpen();
  }
  function toggleMenu(e) {
    e.stopPropagation();
    setMenuOpen((o) => !o);
  }
  function handleArchive(e) {
    e.stopPropagation();
    dispatch({ type: "ARCHIVE_CARD", boardId, cardId: card.id, at: new Date().toISOString() });
    showToast(t("board.cardModal.cardArchivedToast"));
    setMenuOpen(false);
  }
  function handleDuplicate(e) {
    e.stopPropagation();
    dispatch({
      type: "DUPLICATE_CARD",
      boardId,
      cardId: card.id,
      newId: uid(),
      title: `${card.title}${t("board.cardItem.duplicateSuffix")}`,
    });
    showToast(t("board.cardItem.cardDuplicatedToast"));
    setMenuOpen(false);
  }
  function handleDelete(e) {
    e.stopPropagation();
    setMenuOpen(false);
    if (!confirm(t("board.cardModal.deleteCardConfirm"))) return;
    dispatch({ type: "DELETE_CARD", boardId, cardId: card.id });
    showToast(t("board.cardModal.cardDeletedToast"));
  }
  function toggleSubtasksOpen(e) {
    e.stopPropagation();
    setSubtasksOpen((o) => !o);
  }
  function toggleSubtaskDone(subtaskId) {
    dispatch({ type: "TOGGLE_SUBTASK", boardId, cardId: card.id, subtaskId });
  }
  function handleRemoveSubtask(subtaskId) {
    dispatch({ type: "REMOVE_SUBTASK", boardId, cardId: card.id, subtaskId });
  }
  function handleUpdateSubtask(subtaskId, patch) {
    dispatch({ type: "UPDATE_SUBTASK", boardId, cardId: card.id, subtaskId, patch });
  }

  // Dropdown por portal em document.body, mesma razão do popover do DatePicker
  // (ver DatePicker.jsx): a coluna do quadro rola com overflow-y:auto, e um
  // menu posicionado relativo ao card ficaria cortado perto do fim da coluna.
  const DROPDOWN_WIDTH = 160;
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const rect = moreBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(rect.right - DROPDOWN_WIDTH, window.innerWidth - DROPDOWN_WIDTH - 8);
    setMenuCoords({ top: rect.bottom + 4, left: Math.max(left, 8) });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e) {
      if (moreBtnRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  return (
    <div className="kanban-card-wrapper">
    <div
      className={"card" + (dimmed ? " dimmed" : "") + (card.completed ? " completed" : "")}
      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
    >
      {!readOnly && (
        <div className="quick-actions-bar" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="quick-action-btn"
            title={card.completed ? t("board.cardItem.markIncomplete") : t("board.cardItem.markComplete")}
            onClick={toggleCompleted}
          >
            <QuickCheckIcon />
          </button>
          <button type="button" className="quick-action-btn" title={t("board.cardModal.addSubtask")} onClick={handleOpenSubtask}>
            <QuickPlusIcon />
          </button>
          <button type="button" className="quick-action-btn" title={t("board.cardItem.edit")} onClick={handleEdit}>
            <QuickEditIcon />
          </button>
          <button type="button" className="quick-action-btn" ref={moreBtnRef} title={t("board.cardItem.moreActions")} onClick={toggleMenu}>
            <QuickMoreIcon />
          </button>
          {menuOpen &&
            menuCoords &&
            createPortal(
              <div className="quick-actions-dropdown" ref={dropdownRef} style={{ top: menuCoords.top, left: menuCoords.left }}>
                <button type="button" onClick={handleArchive}>
                  {t("board.cardModal.archiveCard")}
                </button>
                <button type="button" onClick={handleDuplicate}>
                  {t("board.cardItem.duplicate")}
                </button>
                <button type="button" className="quick-actions-dropdown-danger" onClick={handleDelete}>
                  {t("board.cardModal.deleteCard")}
                </button>
              </div>,
              document.body
            )}
        </div>
      )}

      {isStuck(card, list) && (
        <div
          className="card-stuck"
          title={t("board.bottlenecks.cardTooltip", { duration: formatDuration(hoursStuck(card), t) })}
        >
          <span className="card-stuck-dot" />
          {formatDuration(hoursStuck(card), t)}
        </div>
      )}

      {card.labels?.length > 0 && (
        <div className="card-labels">
          {card.labels.map((labelId) => {
            const meta = LABEL_COLORS.find((l) => l.id === labelId);
            if (!meta) return null;
            return <span key={labelId} className="card-label" style={{ background: meta.color }} />;
          })}
        </div>
      )}

      <div className="card-title-row">
        <div className="card-title-text">{card.title}</div>
      </div>

      {(hasDue || hasChecklist || hasDesc || hasAttachments || card.urgent || card.important || cardMembers.length > 0) && (
        <div className="card-footer-row">
          <div className="card-meta">
            {card.urgent && (
              <span className="card-meta-item priority-badge-urgent" title={t("board.cardItem.urgent")}>
                <UrgentIcon />
              </span>
            )}
            {card.important && (
              <span className="card-meta-item priority-badge-important" title={t("board.cardItem.important")}>
                <ImportantIcon />
              </span>
            )}
            {hasDue && (
              <span
                className={
                  "card-meta-item" +
                  (isOverdue(card.due, card.checklist) ? " due-overdue" : card.completed ? " due-done" : "")
                }
              >
                <ClockIcon /> {formatDate(card.due, i18n.language)}
              </span>
            )}
            {hasChecklist && (
              <span className="card-meta-item">
                <CheckIcon /> {card.checklist.filter((i) => i.done).length}/{card.checklist.length}
              </span>
            )}
            {hasDesc && (
              <span className="card-meta-item">
                <DescIcon />
              </span>
            )}
            {hasAttachments && (
              <span className="card-meta-item">
                <AttachmentIcon /> {card.attachments.length}
              </span>
            )}
          </div>
          {cardMembers.length > 0 && (
            <div className="card-avatars">
              {cardMembers.map((m) => (
                <span key={m.id} className="avatar avatar-small" style={{ background: colorForUser(m.id) }} title={m.name}>
                  {initials(m.name)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {hasSubtasks && (
        <button
          type="button"
          className={"subtasks-toggle-btn" + (subtasksOpen ? " expanded" : "")}
          onClick={toggleSubtasksOpen}
          aria-expanded={subtasksOpen}
        >
          <ChevronDownIcon />
          <span>{t("board.cardItem.subtasksCount", { count: subtasks.length })}</span>
        </button>
      )}
    </div>

    {hasSubtasks && (
      // Mesmo componente "card" que o pai (SubtaskCard reaproveita
      // card-title-row/card-footer-row/quick-actions-bar), com prioridade
      // (urgente + importante, o mesmo par do card principal), prazo e
      // responsável editáveis ali mesmo - não só uma prévia, um card de
      // verdade ligado à tarefa principal.
      <div className={"subtasks-container" + (subtasksOpen ? " open" : "")}>
        {subtasks.map((st) => (
          <SubtaskCard
            key={st.id}
            subtask={st}
            members={members}
            readOnly={readOnly}
            onOpen={onOpen}
            onToggleDone={() => toggleSubtaskDone(st.id)}
            onRemove={() => handleRemoveSubtask(st.id)}
            onUpdate={(patch) => handleUpdateSubtask(st.id, patch)}
          />
        ))}
      </div>
    )}
    </div>
  );
}
