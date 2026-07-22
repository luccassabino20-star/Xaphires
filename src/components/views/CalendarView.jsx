import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { flattenCards } from "../../utils/boardCards.js";
import { LABEL_COLORS } from "../../utils/labels.js";
import { localeTag } from "../../i18n/locale.js";

// 2021-08-02 foi uma segunda-feira: usado como âncora para gerar os nomes dos dias da semana na ordem seg->dom.
function weekdayNames(lng) {
  const fmt = new Intl.DateTimeFormat(localeTag(lng), { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2021, 7, 2 + i)));
}
function monthNames(lng) {
  const fmt = new Intl.DateTimeFormat(localeTag(lng), { month: "long" });
  return Array.from({ length: 12 }, (_, i) => {
    const name = fmt.format(new Date(2021, i, 1));
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildGrid(monthDate) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const leading = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - leading + 1;
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayOffset);
    cells.push({ date, inMonth: date.getMonth() === monthDate.getMonth() });
  }
  return cells;
}

export default function CalendarView({ board, users, searchQuery, memberFilter, onOpenCard }) {
  const { t, i18n } = useTranslation();
  const WEEKDAYS = useMemo(() => weekdayNames(i18n.language), [i18n.language]);
  const MONTH_NAMES = useMemo(() => monthNames(i18n.language), [i18n.language]);
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const cards = useMemo(() => flattenCards(board), [board]);
  const filtered = cards.filter((c) => {
    const matchesSearch = !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMember = !memberFilter || (c.memberIds || []).includes(memberFilter);
    return matchesSearch && matchesMember;
  });

  const cardsByDate = useMemo(() => {
    const map = {};
    filtered.forEach((c) => {
      if (!c.due) return;
      (map[c.due] ||= []).push(c);
    });
    return map;
  }, [filtered]);

  const grid = useMemo(() => buildGrid(monthDate), [monthDate]);
  const todayIso = toISODate(new Date());

  function goToday() {
    const now = new Date();
    setMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
  }
  function goPrev() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function goNext() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  return (
    <div className="view-scroll">
      <div className="calendar-header">
        <div className="calendar-title">
          {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
        </div>
        <div className="calendar-nav">
          <button className="btn-ghost btn-small" onClick={goToday}>
            {t("views.calendar.today")}
          </button>
          <button className="icon-btn" onClick={goPrev} aria-label={t("views.calendar.prevMonth")}>
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" /></svg>
          </button>
          <button className="icon-btn" onClick={goNext} aria-label={t("views.calendar.nextMonth")}>
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4L13.2 12z" /></svg>
          </button>
        </div>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
        {grid.map(({ date, inMonth }) => {
          const iso = toISODate(date);
          const dayCards = cardsByDate[iso] || [];
          const isToday = iso === todayIso;
          return (
            <div key={iso} className={"calendar-cell" + (inMonth ? "" : " outside") + (isToday ? " today" : "")}>
              <div className="calendar-day-num">{date.getDate()}</div>
              <div className="calendar-day-cards">
                {dayCards.slice(0, 4).map((c) => {
                  const labelMeta = c.labels?.length ? LABEL_COLORS.find((l) => l.id === c.labels[0]) : null;
                  return (
                    <button
                      key={c.id}
                      className={"calendar-card-chip" + (c.completed ? " completed" : "")}
                      style={labelMeta ? { borderLeftColor: labelMeta.color } : undefined}
                      onClick={() => onOpenCard(c.id)}
                      title={c.title}
                    >
                      {c.title}
                    </button>
                  );
                })}
                {dayCards.length > 4 && <div className="calendar-more">{t("views.calendar.more", { count: dayCards.length - 4 })}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
