import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch } from "../../state/BoardContext.jsx";
import { flattenCards } from "../../utils/boardCards.js";
import { LABEL_COLORS } from "../../utils/labels.js";
import { initials, colorForUser } from "../../utils/members.js";

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path fill="currentColor" d="M5 3v18h2v-7h10.5l-2.5-4 2.5-4H7V3z" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm12 8v9H5v-9z" />
    </svg>
  );
}
function DelegateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zM8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path fill="currentColor" d="M9 3v1H4v2h16V4h-5V3H9zM6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13H6z" />
    </svg>
  );
}

const QUADRANT_META = [
  { key: "do", urgent: true, important: true, Icon: FlagIcon, i18nKey: "doNow", accent: "#b3444a" },
  { key: "schedule", urgent: false, important: true, Icon: CalendarIcon, i18nKey: "schedule", accent: "#4d7ea8" },
  { key: "delegate", urgent: true, important: false, Icon: DelegateIcon, i18nKey: "delegate", accent: "#c9922f" },
  { key: "eliminate", urgent: false, important: false, Icon: TrashIcon, i18nKey: "eliminate", accent: "#7a7a82" },
];

export default function MatrixView({ board, users, searchQuery, memberFilter, onOpenCard }) {
  const { t } = useTranslation();
  const dispatch = useBoardDispatch();
  const QUADRANTS = QUADRANT_META.map((q) => ({
    ...q,
    title: t(`views.matrix.${q.i18nKey}.title`),
    subtitle: t(`views.matrix.${q.i18nKey}.subtitle`),
  }));
  const [dragCardId, setDragCardId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);

  const allCards = useMemo(() => flattenCards(board), [board]);
  const filtered = allCards.filter((c) => {
    const matchesSearch = !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMember = !memberFilter || (c.memberIds || []).includes(memberFilter);
    return matchesSearch && matchesMember;
  });

  function cardsFor(q) {
    return filtered.filter((c) => !!c.urgent === q.urgent && !!c.important === q.important);
  }

  function handleDrop(q) {
    if (dragCardId) {
      dispatch({
        type: "UPDATE_CARD",
        boardId: board.id,
        cardId: dragCardId,
        patch: { urgent: q.urgent, important: q.important },
      });
    }
    setDragCardId(null);
    setDragOverKey(null);
  }

  return (
    <div className="view-scroll matrix-scroll">
      <div className="matrix-grid">
        {QUADRANTS.map((q) => {
          const qCards = cardsFor(q);
          return (
            <div
              key={q.key}
              className={"matrix-quadrant" + (dragOverKey === q.key ? " drag-over" : "")}
              style={{ borderTopColor: q.accent }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverKey(q.key);
              }}
              onDragLeave={() => setDragOverKey((k) => (k === q.key ? null : k))}
              onDrop={() => handleDrop(q)}
            >
              <div className="matrix-quadrant-header">
                <span className="matrix-quadrant-icon">
                  <q.Icon />
                </span>
                <div>
                  <div className="matrix-quadrant-title">{q.title}</div>
                  <div className="matrix-quadrant-subtitle">{q.subtitle}</div>
                </div>
                <span className="matrix-quadrant-count">{qCards.length}</span>
              </div>

              <div className="matrix-quadrant-cards">
                {qCards.map((c) => {
                  const labelMeta = c.labels?.length ? LABEL_COLORS.find((l) => l.id === c.labels[0]) : null;
                  const cardMembers = (c.memberIds || []).map((id) => users.find((m) => m.id === id)).filter(Boolean);
                  return (
                    <div
                      key={c.id}
                      className={"matrix-card" + (c.completed ? " completed" : "")}
                      draggable
                      onDragStart={() => setDragCardId(c.id)}
                      onDragEnd={() => {
                        setDragCardId(null);
                        setDragOverKey(null);
                      }}
                      onClick={() => onOpenCard(c.id)}
                    >
                      {labelMeta && <span className="matrix-card-label" style={{ background: labelMeta.color }} />}
                      <span className="matrix-card-title">{c.title}</span>
                      {cardMembers.length > 0 && (
                        <div className="matrix-card-avatars">
                          {cardMembers.map((m) => (
                            <span
                              key={m.id}
                              className="avatar avatar-small"
                              style={{ background: colorForUser(m.id) }}
                              title={m.name}
                            >
                              {initials(m.name)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {qCards.length === 0 && <div className="matrix-quadrant-empty">{t("views.matrix.dropHere")}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
