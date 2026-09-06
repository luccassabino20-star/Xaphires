import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch } from "../../state/BoardContext.jsx";
import { flattenCards } from "../../utils/boardCards.js";
import { LABEL_COLORS } from "../../utils/labels.js";
import { isCompletionColumnTitle } from "../../utils/columnCompletion.js";
import { localeTag } from "../../i18n/locale.js";
import { uid } from "../../utils/id.js";
import Avatar from "../Avatar.jsx";

// Mesma paleta de 5 cores (mesmo hex) que CalendarView.jsx e DashboardView.jsx
// já usam pra "cor por lista" - cicla pela posição da lista no quadro, então
// a pílula de status muda de cor sozinha mesmo em quadros com nomes de lista
// que fogem do "A Fazer/Em andamento/Concluído" de livro-texto. Lista de
// conclusão (isCompletionColumnTitle) sempre vence para verde, de propósito.
const LIST_PALETTE = ["#3b82f6", "#f59e0b", "#a855f7", "#f43f5e", "#10b981"];
function statusColorFor(listId, board) {
  const idx = board.lists.findIndex((l) => l.id === listId);
  if (idx >= 0 && isCompletionColumnTitle(board.lists[idx].title)) return "var(--success)";
  return LIST_PALETTE[idx >= 0 ? idx % LIST_PALETTE.length : 0];
}

function formatDate(iso, lng) {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString(localeTag(lng));
}
function isOverdue(iso) {
  if (!iso) return false;
  return new Date(iso + "T23:59:59").getTime() < Date.now();
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}
// Par de setas empilhadas (estilo Notion/Linear) - discreto quando a coluna
// não é a ordenação ativa, vira uma seta única na cor de destaque quando é.
function IconSort({ active, dir }) {
  if (!active) {
    return (
      <svg viewBox="0 0 24 24" width="10" height="10" className="tbl-sort-icon">
        <path fill="currentColor" d="m12 5 4 5H8l4-5Zm0 14-4-5h8l-4 5Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="10" height="10" className="tbl-sort-icon active">
      <path fill="currentColor" d={dir === "asc" ? "m12 6 6 7H6l6-7Z" : "m12 18 6-7H6l6 7Z"} />
    </svg>
  );
}
function IconMore() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="5" r="0.5" />
      <circle cx="12" cy="12" r="0.5" />
      <circle cx="12" cy="19" r="0.5" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11">
      <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
    </svg>
  );
}

const COLUMN_IDS = ["completed", "title", "listTitle", "labels", "members", "startDate", "due", "checklist"];
// Colunas em que o ícone de ordenação some de propósito - "completed" já tem
// o próprio ícone de checkbox, e etiquetas/membros são coleções, não valor
// escalar ordenável de forma que faça sentido pra quem olha a tabela.
const UNSORTABLE = new Set(["completed", "labels", "members"]);

export default function TableView({ board, users, searchQuery, memberFilter, onOpenCard }) {
  const { t, i18n } = useTranslation();
  const dispatch = useBoardDispatch();
  const readOnly = board.myRole === "viewer";
  const LABEL_NAMES = t("views.dashboard.labelNames", { returnObjects: true });
  const COLUMNS = COLUMN_IDS.map((id) => ({ id, label: t(`views.table.columns.${id}`) }));
  const [sortBy, setSortBy] = useState("title");
  const [sortDir, setSortDir] = useState("asc");
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");

  const cards = useMemo(() => flattenCards(board), [board]);

  const filtered = cards.filter((c) => {
    const matchesSearch = !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMember = !memberFilter || (c.memberIds || []).includes(memberFilter);
    return matchesSearch && matchesMember;
  });

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let av, bv;
      switch (sortBy) {
        case "completed":
          av = a.completed ? 1 : 0;
          bv = b.completed ? 1 : 0;
          break;
        case "listTitle":
          av = a.listTitle;
          bv = b.listTitle;
          break;
        case "startDate":
          av = a.startDate || "";
          bv = b.startDate || "";
          break;
        case "due":
          av = a.due || "";
          bv = b.due || "";
          break;
        case "checklist":
          av = a.checklist.length ? a.checklist.filter((i) => i.done).length / a.checklist.length : -1;
          bv = b.checklist.length ? b.checklist.filter((i) => i.done).length / b.checklist.length : -1;
          break;
        default:
          av = a.title;
          bv = b.title;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filtered, sortBy, sortDir]);

  function handleSort(colId) {
    if (UNSORTABLE.has(colId)) return;
    if (sortBy === colId) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(colId);
      setSortDir("asc");
    }
  }

  // Mesmo desenho de "+" rápido de CalendarView.jsx (handleQuickAdd): sem
  // lista pra escolher aqui, então cai sempre na primeira do quadro - quem
  // quiser outra lista abre o cartão e move, ou usa o Quadro mesmo.
  function submitAdd(e) {
    e.preventDefault();
    const titulo = draftTitle.trim();
    setDraftTitle("");
    setAdding(false);
    if (!titulo) return;
    const list = board.lists[0];
    if (!list) return;
    dispatch({ type: "ADD_CARD", boardId: board.id, listId: list.id, id: uid(), title: titulo });
  }

  return (
    <div className="view-scroll">
      <div className="table-view-wrap">
        <table className="board-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const sortable = !UNSORTABLE.has(col.id);
                if (col.id === "completed") {
                  return (
                    <th key={col.id} className="tbl-col-status" title={t("views.table.statusColumnLabel")}>
                      <IconCheck />
                    </th>
                  );
                }
                return (
                  <th key={col.id} className={sortable ? "sortable" : ""} onClick={() => handleSort(col.id)}>
                    <span className="tbl-th-inner">
                      {col.label}
                      {sortable && <IconSort active={sortBy === col.id} dir={sortDir} />}
                    </span>
                  </th>
                );
              })}
              <th className="tbl-col-actions" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((card) => {
              const done = card.checklist.filter((i) => i.done).length;
              const total = card.checklist.length;
              const cardMembers = (card.memberIds || []).map((id) => users.find((u) => u.id === id)).filter(Boolean);
              const startLabel = formatDate(card.startDate, i18n.language);
              const dueLabel = formatDate(card.due, i18n.language);
              const overdue = !card.completed && isOverdue(card.due);
              return (
                <tr key={card.id} className={card.completed ? "row-completed" : ""} onClick={() => onOpenCard(card.id)}>
                  <td className="tbl-col-status">
                    <span className={"card-complete-check table-check" + (card.completed ? " checked" : "")}>
                      {card.completed && <IconCheck />}
                    </span>
                  </td>
                  <td className={"table-title" + (card.completed ? " completed-text" : "")}>{card.title}</td>
                  <td>
                    <span className="tbl-chip" style={{ "--chip-color": statusColorFor(card.listId, board) }}>
                      {card.listTitle}
                    </span>
                  </td>
                  <td>
                    <div className="tbl-chip-row">
                      {card.labels.map((labelId) => {
                        const meta = LABEL_COLORS.find((l) => l.id === labelId);
                        if (!meta) return null;
                        return (
                          <span key={labelId} className="tbl-chip" style={{ "--chip-color": meta.color }}>
                            {LABEL_NAMES[labelId] || labelId}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <div className="tbl-avatar-group">
                      {cardMembers.map((m) => (
                        <Avatar key={m.id} id={m.id} name={m.name} avatarUrl={m.avatarUrl} className="avatar-small" title={m.name} />
                      ))}
                    </div>
                  </td>
                  <td>
                    {startLabel ? (
                      <span className="tbl-date-badge">
                        <IconCalendar />
                        {startLabel}
                      </span>
                    ) : (
                      <span className="tbl-dash">—</span>
                    )}
                  </td>
                  <td>
                    {dueLabel ? (
                      <span className={"tbl-date-badge" + (overdue ? " overdue" : "")}>
                        <IconCalendar />
                        {dueLabel}
                      </span>
                    ) : (
                      <span className="tbl-dash">—</span>
                    )}
                  </td>
                  <td>
                    {total > 0 ? (
                      <span className={"tbl-checklist-pill" + (done === total ? " all-done" : "")}>
                        {done}/{total}
                      </span>
                    ) : (
                      <span className="tbl-dash">—</span>
                    )}
                  </td>
                  <td className="tbl-col-actions">
                    <button
                      type="button"
                      className="tbl-row-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCard(card.id);
                      }}
                      aria-label={t("views.table.openCard")}
                      title={t("views.table.openCard")}
                    >
                      <IconMore />
                    </button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="table-empty">
                  {t("views.table.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {!readOnly && board.lists.length > 0 && (
          <div className="tbl-add-row">
            {adding ? (
              <form className="tbl-add-form" onSubmit={submitAdd}>
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={() => {
                    if (!draftTitle.trim()) setAdding(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setDraftTitle("");
                      setAdding(false);
                    }
                  }}
                  placeholder={t("board.listColumn.cardTitlePlaceholder")}
                />
                <button type="submit" className="btn-primary btn-small" disabled={!draftTitle.trim()}>
                  {t("planner.add")}
                </button>
              </form>
            ) : (
              <button type="button" className="tbl-add-btn" onClick={() => setAdding(true)}>
                <IconPlus />
                {t("views.table.addCard")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
