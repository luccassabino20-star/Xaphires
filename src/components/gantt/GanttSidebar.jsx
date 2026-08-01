import { useTranslation } from "react-i18next";
import { IconChevron, IconWarning, IconFolder, IconCircleCheck, IconCircleDot } from "./ganttIcons.jsx";
import { GANTT_STATUS, GANTT_LATE_COLOR } from "./ganttStatus.js";
import { ROW_HEIGHT, GROUP_HEIGHT, HEADER_HEIGHT, SIDEBAR_WIDTH, STATUS_COL_WIDTH } from "./ganttConstants.js";

export default function GanttSidebar({ rows, onToggleGroup, onOpenTask }) {
  const { t } = useTranslation();
  return (
    <div className="gnt-sidebar" style={{ width: SIDEBAR_WIDTH }}>
      <div className="gnt-sidebar-head" style={{ height: HEADER_HEIGHT }}>
        <span className="gnt-sidebar-head-activity">{t("gantt.columns.activity")}</span>
        <span className="gnt-sidebar-head-status" style={{ width: STATUS_COL_WIDTH }}>{t("gantt.columns.status")}</span>
      </div>

      {rows.map((row) =>
        row.type === "group" ? (
          <button
            key={row.key}
            type="button"
            className="gnt-group-row"
            style={{ height: GROUP_HEIGHT }}
            onClick={() => onToggleGroup(row.id)}
          >
            <IconChevron size={11} className={"gnt-chevron" + (row.collapsed ? " collapsed" : "")} />
            <IconFolder size={13} className="gnt-group-icon" />
            <span className="gnt-group-title">{row.title}</span>
          </button>
        ) : (
          <SidebarTaskRow key={row.key} task={row.task} depth={row.depth} onOpen={onOpenTask} />
        )
      )}
    </div>
  );
}

function SidebarTaskRow({ task, depth, onOpen }) {
  const { t } = useTranslation();
  const meta = GANTT_STATUS[task.status] || GANTT_STATUS.notStarted;
  const statusColor = task.late ? GANTT_LATE_COLOR : meta.color;
  const statusLabel = task.late ? t("gantt.status.lateFlag") : meta.labelKey ? t(meta.labelKey) : "";
  const done = task.status === "done";
  return (
    <button
      type="button"
      className={"gnt-task-row" + (depth > 0 ? " gnt-task-row-child" : "")}
      style={{ height: ROW_HEIGHT }}
      onClick={() => onOpen?.(task)}
    >
      <span className="gnt-task-title" style={{ paddingLeft: 14 + depth * 18 }} title={task.title}>
        <span className="gnt-task-status-dot" style={{ color: statusColor || "var(--text-muted)" }}>
          {done ? <IconCircleCheck size={depth > 0 ? 13 : 15} /> : <IconCircleDot size={depth > 0 ? 13 : 15} filled={depth > 0} />}
        </span>
        {task.title}
      </span>
      <span className="gnt-task-status" style={{ width: STATUS_COL_WIDTH, color: statusColor || undefined }}>
        {task.late && <IconWarning size={11} />}
        {statusLabel}
      </span>
    </button>
  );
}
