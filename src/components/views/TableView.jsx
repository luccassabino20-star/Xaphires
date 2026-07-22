import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { flattenCards } from "../../utils/boardCards.js";
import { LABEL_COLORS } from "../../utils/labels.js";
import { initials, colorForUser } from "../../utils/members.js";
import { localeTag } from "../../i18n/locale.js";

function formatDate(iso, lng) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(localeTag(lng));
}

const COLUMN_IDS = ["completed", "title", "listTitle", "labels", "members", "startDate", "due", "checklist"];

export default function TableView({ board, users, searchQuery, memberFilter, onOpenCard }) {
  const { t, i18n } = useTranslation();
  const COLUMNS = COLUMN_IDS.map((id) => ({ id, label: t(`views.table.columns.${id}`) }));
  const [sortBy, setSortBy] = useState("title");
  const [sortDir, setSortDir] = useState("asc");

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
    if (colId === "labels" || colId === "members") return;
    if (sortBy === colId) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(colId);
      setSortDir("asc");
    }
  }

  return (
    <div className="view-scroll">
      <div className="table-view-wrap">
        <table className="board-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.id}
                  className={col.id === "labels" || col.id === "members" ? "" : "sortable"}
                  onClick={() => handleSort(col.id)}
                >
                  {col.label}
                  {sortBy === col.id && <span className="sort-arrow">{sortDir === "asc" ? " ▲" : " ▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((card) => {
              const done = card.checklist.filter((i) => i.done).length;
              const cardMembers = (card.memberIds || []).map((id) => users.find((u) => u.id === id)).filter(Boolean);
              return (
                <tr key={card.id} className={card.completed ? "row-completed" : ""} onClick={() => onOpenCard(card.id)}>
                  <td>
                    <span className={"card-complete-check table-check" + (card.completed ? " checked" : "")}>
                      {card.completed && (
                        <svg viewBox="0 0 24 24" width="11" height="11">
                          <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                        </svg>
                      )}
                    </span>
                  </td>
                  <td className={"table-title" + (card.completed ? " completed-text" : "")}>{card.title}</td>
                  <td>{card.listTitle}</td>
                  <td>
                    <div className="card-labels" style={{ marginBottom: 0 }}>
                      {card.labels.map((labelId) => {
                        const meta = LABEL_COLORS.find((l) => l.id === labelId);
                        if (!meta) return null;
                        return <span key={labelId} className="card-label" style={{ background: meta.color }} />;
                      })}
                    </div>
                  </td>
                  <td>
                    <div className="card-avatars">
                      {cardMembers.map((m) => (
                        <span key={m.id} className="avatar avatar-small" style={{ background: colorForUser(m.id) }} title={m.name}>
                          {initials(m.name)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{formatDate(card.startDate, i18n.language)}</td>
                  <td>{formatDate(card.due, i18n.language)}</td>
                  <td>{card.checklist.length ? `${done}/${card.checklist.length}` : "—"}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="table-empty">
                  {t("views.table.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
