import { useTranslation } from "react-i18next";
import { useBoardDispatch } from "../state/BoardContext.jsx";
import { LABEL_COLORS } from "../utils/labels.js";
import { isStuck, hoursStuck, formatDuration } from "../utils/bottlenecks.js";
import { initials, colorForUser } from "../utils/members.js";
import { localeTag } from "../i18n/locale.js";

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
function CheckmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12">
      <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
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

export default function CardItem({ card, list, boardId, members, searchQuery, memberFilter, onOpen, readOnly, onDragStart, onDragEnd }) {
  const { t, i18n } = useTranslation();
  const dispatch = useBoardDispatch();
  const matchesSearch = !searchQuery || card.title.toLowerCase().includes(searchQuery.toLowerCase());
  const matchesMemberFilter = !memberFilter || (card.memberIds || []).includes(memberFilter);
  const dimmed = !matchesSearch || !matchesMemberFilter;

  const hasDue = !!card.due;
  const hasChecklist = card.checklist && card.checklist.length > 0;
  const hasDesc = !!(card.description && card.description.trim());
  const hasAttachments = card.attachments && card.attachments.length > 0;
  const cardMembers = (card.memberIds || []).map((id) => members.find((m) => m.id === id)).filter(Boolean);

  function toggleCompleted(e) {
    e.stopPropagation();
    dispatch({ type: "TOGGLE_CARD_COMPLETED", boardId, cardId: card.id });
  }

  return (
    <div
      className={"card" + (dimmed ? " dimmed" : "") + (card.completed ? " completed" : "")}
      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
    >
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
        <button
          type="button"
          className={"card-complete-check" + (card.completed ? " checked" : "")}
          disabled={readOnly}
          onClick={toggleCompleted}
          title={card.completed ? t("board.cardItem.markIncomplete") : t("board.cardItem.markComplete")}
        >
          {card.completed && <CheckmarkIcon />}
        </button>
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
              <span className={"card-meta-item" + (isOverdue(card.due, card.checklist) ? " due-overdue" : "")}>
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
    </div>
  );
}
