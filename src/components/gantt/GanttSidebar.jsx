import { useTranslation } from "react-i18next";
import { IconChevron, IconWarning } from "./ganttIcons.jsx";
import { GANTT_STATUS, GANTT_LATE_COLOR } from "./ganttStatus.js";
import { ROW_HEIGHT, GROUP_HEIGHT, HEADER_HEIGHT, SIDEBAR_WIDTH, STATUS_COL_WIDTH } from "./ganttConstants.js";

export default function GanttSidebar({ rows, onToggleGroup }) {
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
            <span className="gnt-group-title">{row.title}</span>
          </button>
        ) : (
          <SidebarTaskRow key={row.key} task={row.task} depth={row.depth} />
        )
      )}
    </div>
  );
}

function SidebarTaskRow({ task, depth }) {
  const { t } = useTranslation();
  const meta = GANTT_STATUS[task.status] || GANTT_STATUS.notStarted;
  const statusColor = task.late ? GANTT_LATE_COLOR : meta.color;
  const statusLabel = task.late ? t("gantt.status.lateFlag") : meta.labelKey ? t(meta.labelKey) : "";
  return (
    <div className="gnt-task-row" style={{ height: ROW_HEIGHT }}>
      <span className="gnt-task-title" style={{ paddingLeft: 14 + depth * 16 }} title={task.title}>
        {depth > 0 && <span className="gnt-task-dash">-</span>}
        {task.title}
      </span>
      <span className="gnt-task-status" style={{ width: STATUS_COL_WIDTH, color: statusColor || undefined }}>
        {task.late && <IconWarning size={11} />}
        {statusLabel}
      </span>
    </div>
  );
}
