import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { select } from "d3-selection";
import { scaleTime } from "d3-scale";
import { axisTop } from "d3-axis";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import { timeYear, timeMonth, timeWeek, timeDay, timeHour, timeMinute } from "d3-time";
import { flattenCards } from "../../utils/boardCards.js";
import { LABEL_COLORS } from "../../utils/labels.js";
import { localeTag } from "../../i18n/locale.js";

const MS_DAY = 86400000;
const BASE_DAY_WIDTH = 36;
const ROW_HEIGHT = 46;
const AXIS_HEIGHT = 34;
const MIN_BAR_WIDTH = 20;

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

function multiFormat(date, tag) {
  const fmt = (opts) => new Intl.DateTimeFormat(tag, opts).format(date);
  if (timeMinute(date) < date) return fmt({ hour: "2-digit", minute: "2-digit" });
  if (timeHour(date) < date) return fmt({ hour: "2-digit", minute: "2-digit" });
  if (timeDay(date) < date) return fmt({ hour: "2-digit" });
  if (timeMonth(date) < date) {
    if (timeWeek(date) < date) return fmt({ day: "numeric", month: "short" });
    return fmt({ day: "numeric", month: "short" });
  }
  if (timeYear(date) < date) return fmt({ month: "short" });
  return fmt({ year: "numeric" });
}

export default function TimelineView({ board, searchQuery, memberFilter, onOpenCard }) {
  const { t, i18n } = useTranslation();
  const tag = localeTag(i18n.language);
  const [scaleColEl, setScaleColEl] = useState(null);
  const axisRef = useRef(null);
  const zoomBehaviorRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(600);
  const [xScale, setXScale] = useState(null);

  const allCards = useMemo(() => flattenCards(board), [board]);
  const filtered = allCards.filter((c) => {
    const matchesSearch = !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMember = !memberFilter || (c.memberIds || []).includes(memberFilter);
    return matchesSearch && matchesMember;
  });
  const dated = filtered.filter((c) => c.startDate || c.due);
  const undatedCount = filtered.length - dated.length;

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (dated.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { rangeStart: addDays(today, -3), rangeEnd: addDays(today, 11) };
    }
    let min = null;
    let max = null;
    dated.forEach((c) => {
      const s = parseISO(c.startDate || c.due);
      const e = parseISO(c.due || c.startDate);
      if (!min || s < min) min = s;
      if (!max || e > max) max = e;
    });
    return { rangeStart: addDays(min, -2), rangeEnd: addDays(max, 2) };
  }, [dated]);

  const rows = board.lists
    .map((list) => ({ list, cards: dated.filter((c) => c.listId === list.id) }))
    .filter((row) => row.cards.length > 0);

  const baseScale = useMemo(() => {
    const totalDays = Math.max(diffDays(rangeStart, rangeEnd) + 1, 1);
    const width = Math.max(totalDays * BASE_DAY_WIDTH, viewportWidth);
    return scaleTime().domain([rangeStart, rangeEnd]).range([0, width]);
  }, [rangeStart, rangeEnd, viewportWidth]);

  useEffect(() => {
    if (!scaleColEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setViewportWidth(w);
    });
    ro.observe(scaleColEl);
    return () => ro.disconnect();
  }, [scaleColEl]);

  useEffect(() => {
    if (!scaleColEl) return;
    const [r0, r1] = baseScale.range();
    const pad = viewportWidth;
    const z = d3zoom()
      .scaleExtent([0.4, 24])
      .translateExtent([
        [r0 - pad, 0],
        [r1 + pad, ROW_HEIGHT],
      ])
      .clickDistance(6)
      .on("zoom", (event) => setXScale(() => event.transform.rescaleX(baseScale)));
    zoomBehaviorRef.current = z;
    const sel = select(scaleColEl);
    sel.call(z);
    sel.call(z.transform, zoomIdentity);
    setXScale(() => baseScale);
    return () => sel.on(".zoom", null);
  }, [scaleColEl, baseScale, viewportWidth]);

  useEffect(() => {
    if (!axisRef.current || !xScale) return;
    const axis = axisTop(xScale)
      .ticks(Math.max(Math.round(viewportWidth / 90), 2))
      .tickSizeOuter(0)
      .tickFormat((d) => multiFormat(d, tag));
    select(axisRef.current).call(axis);
  }, [xScale, viewportWidth, tag]);

  const resetZoom = () => {
    if (!zoomBehaviorRef.current || !scaleColEl) return;
    select(scaleColEl).call(zoomBehaviorRef.current.transform, zoomIdentity);
  };

  const scale = xScale || baseScale;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayX = scale(today);
  const showToday = todayX >= 0 && todayX <= viewportWidth;

  const ticks = xScale
    ? xScale.ticks(Math.max(Math.round(viewportWidth / 90), 2)).map((d) => ({ x: scale(d), key: +d }))
    : [];

  if (dated.length === 0) {
    return (
      <div className="view-scroll">
        <div className="view-placeholder">{t("views.timeline.empty")}</div>
      </div>
    );
  }

  return (
    <div className="view-scroll timeline-scroll">
      <div className="timeline-wrap">
        <div className="timeline-labels-col">
          <div className="timeline-row-label timeline-axis-spacer" style={{ height: AXIS_HEIGHT, minHeight: AXIS_HEIGHT }} />
          {rows.map((r) => (
            <div key={r.list.id} className="timeline-row-label" style={{ height: ROW_HEIGHT, minHeight: ROW_HEIGHT }}>
              {r.list.title}
            </div>
          ))}
        </div>

        <div className="timeline-scale-col" ref={setScaleColEl}>
          <svg className="timeline-axis-svg" width={viewportWidth} height={AXIS_HEIGHT}>
            <g ref={axisRef} className="timeline-axis" transform={`translate(0, ${AXIS_HEIGHT})`} />
          </svg>

          <div className="timeline-grid" style={{ top: AXIS_HEIGHT }}>
            {ticks.map((tick) => (
              <div key={tick.key} className="timeline-grid-line" style={{ left: tick.x }} />
            ))}
            {showToday && <div className="timeline-today-line" style={{ left: todayX }} />}
          </div>

          {rows.map((r) => (
            <div key={r.list.id} className="timeline-row-track" style={{ height: ROW_HEIGHT }}>
              {r.cards.map((c) => {
                const s = parseISO(c.startDate || c.due);
                const e = parseISO(c.due || c.startDate);
                const left = scale(s);
                const width = Math.max(scale(e) - scale(s), MIN_BAR_WIDTH);
                if (left + width < -40 || left > viewportWidth + 40) return null;
                const labelMeta = c.labels?.length ? LABEL_COLORS.find((l) => l.id === c.labels[0]) : null;
                return (
                  <button
                    key={c.id}
                    className={"timeline-bar" + (c.completed ? " completed" : "")}
                    // Sem etiqueta a barra cai no --accent do tema, que no escuro é
                    // quase branco (#e5e5e5) - texto branco fixo (.timeline-bar)
                    // fica ilegível nesse caso. var(--bg-app) é o par que
                    // .btn-primary já usa para textos sobre --accent.
                    style={{
                      left,
                      width,
                      background: labelMeta ? labelMeta.color : "var(--accent)",
                      color: labelMeta ? undefined : "var(--bg-app)",
                    }}
                    onClick={() => onOpenCard(c.id)}
                    title={c.title}
                  >
                    {c.title}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="timeline-toolbar">
        <span className="timeline-hint">{t("views.timeline.zoomHint")}</span>
        <button type="button" className="timeline-reset-btn" onClick={resetZoom}>
          {t("views.timeline.resetZoom")}
        </button>
      </div>

      {undatedCount > 0 && <div className="timeline-footnote">{t("views.timeline.undated", { count: undatedCount })}</div>}
    </div>
  );
}
