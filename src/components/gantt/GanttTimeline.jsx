import { buildDayColumns, groupHeaderRuns, diffDays, today0 } from "./ganttDate.js";
import { ROW_HEIGHT, GROUP_HEIGHT, HEADER_ROW_HEIGHT, HEADER_HEIGHT } from "./ganttConstants.js";
import GanttBar from "./GanttBar.jsx";

export default function GanttTimeline({ rows, rangeStart, rangeEnd, dayWidth, tag, onChangeTask, onOpenTask }) {
  const days = buildDayColumns(rangeStart, rangeEnd);
  const totalWidth = days.length * dayWidth;
  const yearRuns = groupHeaderRuns(days, tag, "year");
  const monthRuns = groupHeaderRuns(days, tag, "month");

  const today = today0();
  const todayOffset = diffDays(rangeStart, today);
  const showToday = todayOffset >= 0 && todayOffset < days.length;
  const todayLeft = todayOffset * dayWidth + dayWidth / 2;

  return (
    <div className="gnt-timeline-pane">
      <div className="gnt-timeline-inner" style={{ width: totalWidth }}>
        <div className="gnt-header" style={{ height: HEADER_HEIGHT }}>
          <div className="gnt-header-row" style={{ height: HEADER_ROW_HEIGHT }}>
            {yearRuns.map((run) => (
              <span key={run.key} className="gnt-header-cell gnt-header-year" style={{ width: run.span * dayWidth }}>
                {run.label}
              </span>
            ))}
          </div>
          <div className="gnt-header-row" style={{ height: HEADER_ROW_HEIGHT }}>
            {monthRuns.map((run) => (
              <span key={run.key} className="gnt-header-cell gnt-header-month" style={{ width: run.span * dayWidth }}>
                {run.label}
              </span>
            ))}
          </div>
          <div className="gnt-header-row" style={{ height: HEADER_ROW_HEIGHT }}>
            {days.map((day, i) => (
              <span key={i} className="gnt-header-cell gnt-header-day" style={{ width: dayWidth }}>
                {day.getDate()}
              </span>
            ))}
          </div>
        </div>

        <div className="gnt-grid" style={{ width: totalWidth }}>
          {days.map((day, i) => (
            <div
              key={i}
              className={"gnt-grid-col" + (day.getDay() === 0 || day.getDay() === 6 ? " weekend" : "")}
              style={{ left: i * dayWidth, width: dayWidth }}
            />
          ))}
          {showToday && <div className="gnt-today-line" style={{ left: todayLeft }} />}
        </div>

        <div className="gnt-rows">
          {rows.map((row, idx) =>
            row.type === "group" ? (
              <div
                key={row.key}
                className={"gnt-row-track gnt-group-track" + (idx % 2 ? " odd" : "")}
                style={{ height: GROUP_HEIGHT }}
              />
            ) : (
              <div key={row.key} className={"gnt-row-track" + (idx % 2 ? " odd" : "")} style={{ height: ROW_HEIGHT }}>
                <GanttBar task={row.task} rangeStart={rangeStart} dayWidth={dayWidth} onChange={onChangeTask} onOpen={onOpenTask} />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
