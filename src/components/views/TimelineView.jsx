import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { flattenCards } from "../../utils/boardCards.js";
import { LABEL_COLORS } from "../../utils/labels.js";
import { localeTag } from "../../i18n/locale.js";

const DAY_WIDTH = 36;
const MS_DAY = 86400000;

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function diffDays(a, b) {
  return Math.round((b - a) / MS_DAY);
}
function buildDays(start, end) {
  const arr = [];
  let d = new Date(start);
  while (d <= end) {
    arr.push(new Date(d));
    d = addDays(d, 1);
  }
  return arr;
}

export default function TimelineView({ board, searchQuery, memberFilter, onOpenCard }) {
  const { t, i18n } = useTranslation();
  const allCards = useMemo(() => flattenCards(board), [board]);
  const filtered = allCards.filter((c) => {
    const matchesSearch = !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMember = !memberFilter || (c.memberIds || []).includes(memberFilter);
    return matchesSearch && matchesMember;
  });
  const dated = filtered.filter((c) => c.startDate || c.due);
  const undatedCount = filtered.length - dated.length;

  const { rangeStart, days } = useMemo(() => {
    if (dated.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = addDays(today, -3);
      const end = addDays(today, 11);
      return { rangeStart: start, days: buildDays(start, end) };
    }
    let min = null;
    let max = null;
    dated.forEach((c) => {
      const s = parseISO(c.startDate || c.due);
      const e = parseISO(c.due || c.startDate);
      if (!min || s < min) min = s;
      if (!max || e > max) max = e;
    });
    const start = addDays(min, -2);
    const end = addDays(max, 2);
    return { rangeStart: start, days: buildDays(start, end) };
  }, [dated]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = diffDays(rangeStart, today);
  const totalWidth = days.length * DAY_WIDTH;

  const rows = board.lists
    .map((list) => ({ list, cards: dated.filter((c) => c.listId === list.id) }))
    .filter((row) => row.cards.length > 0);

  if (dated.length === 0) {
    return (
      <div className="view-scroll">
        <div className="view-placeholder">{t("views.timeline.empty")}</div>
      </div>
    );
  }

  return (
    <div className="view-scroll timeline-scroll">
      <div className="timeline-wrap" style={{ minWidth: totalWidth + 180 }}>
        <div className="timeline-header">
          <div className="timeline-row-label" />
          <div className="timeline-days" style={{ width: totalWidth }}>
            {days.map((d, i) => (
              <div key={i} className={"timeline-day" + (i === todayOffset ? " today" : "")} style={{ width: DAY_WIDTH }}>
                <div className="timeline-day-date">{d.getDate()}</div>
                <div className="timeline-day-month">{d.toLocaleDateString(localeTag(i18n.language), { month: "short" }).replace(".", "")}</div>
              </div>
            ))}
          </div>
        </div>

        {rows.map(({ list, cards }) => (
          <div key={list.id} className="timeline-row">
            <div className="timeline-row-label">{list.title}</div>
            <div className="timeline-row-track" style={{ width: totalWidth }}>
              {todayOffset >= 0 && todayOffset < days.length && (
                <div className="timeline-today-line" style={{ left: todayOffset * DAY_WIDTH }} />
              )}
              {cards.map((c) => {
                const s = parseISO(c.startDate || c.due);
                const e = parseISO(c.due || c.startDate);
                const left = diffDays(rangeStart, s) * DAY_WIDTH;
                const width = Math.max((diffDays(s, e) + 1) * DAY_WIDTH - 4, DAY_WIDTH - 4);
                const labelMeta = c.labels?.length ? LABEL_COLORS.find((l) => l.id === c.labels[0]) : null;
                return (
                  <button
                    key={c.id}
                    className={"timeline-bar" + (c.completed ? " completed" : "")}
                    style={{ left, width, background: labelMeta ? labelMeta.color : "var(--accent)" }}
                    onClick={() => onOpenCard(c.id)}
                    title={c.title}
                  >
                    {c.title}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {undatedCount > 0 && (
        <div className="timeline-footnote">{t("views.timeline.undated", { count: undatedCount })}</div>
      )}
    </div>
  );
}
