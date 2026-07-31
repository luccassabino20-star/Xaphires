import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import GanttToolbar from "./GanttToolbar.jsx";
import GanttSidebar from "./GanttSidebar.jsx";
import GanttTimeline from "./GanttTimeline.jsx";
import GanttLegend from "./GanttLegend.jsx";
import { buildGanttRows } from "./GanttRows.js";
import { addDays, parseISO } from "./ganttDate.js";
import { localeTag } from "../../i18n/locale.js";
import { DAY_WIDTH_LEVELS, DEFAULT_ZOOM_INDEX } from "./ganttConstants.js";
import { ganttMockData } from "./ganttMockData.js";

// Componente desacoplado de propósito - não lê ata, cartão nem nenhuma outra
// entidade real do app diretamente (ver decisão registrada na conversa).
// groups/meta têm os dados de exemplo como default só para dar pra abrir e ver
// funcionando; quem integra de verdade (ver MinutesGanttView) passa os
// próprios dados por prop, e opcionalmente onTaskClick pra abrir algo real em
// vez do "peek" interno, e legendStatusKeys/legendIconKeys pra legenda não
// listar cor/ícone que aquele contexto nunca usa.
export default function GanttChart({
  groups: initialGroups = ganttMockData.groups,
  meta = ganttMockData.meta,
  onTaskClick,
  legendStatusKeys,
  legendIconKeys,
}) {
  const { t, i18n } = useTranslation();
  const tag = localeTag(i18n.language);
  const [groups, setGroups] = useState(initialGroups);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [peekTask, setPeekTask] = useState(null);

  // groups é estado local só pra permitir o drag/resize (visual, não
  // persistido - ver GanttBar.jsx). Se quem chama passar um `groups` novo
  // (ata editada, item marcado como concluído etc.), a fonte de verdade de
  // fora tem que vencer, senão o Gantt mostra dado velho até remontar.
  useEffect(() => {
    setGroups(initialGroups);
  }, [initialGroups]);

  const dayWidth = DAY_WIDTH_LEVELS[zoomIndex];

  function toggleGroup(id) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateTask(taskId, patch) {
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        tasks: group.tasks.map((task) => {
          if (task.id === taskId) return { ...task, ...patch };
          if (task.children?.some((c) => c.id === taskId)) {
            return { ...task, children: task.children.map((c) => (c.id === taskId ? { ...c, ...patch } : c)) };
          }
          return task;
        }),
      }))
    );
    setPeekTask((prev) => (prev && prev.id === taskId ? { ...prev, ...patch } : prev));
  }

  const rows = useMemo(() => buildGanttRows(groups, collapsedIds), [groups, collapsedIds]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    let min = null;
    let max = null;
    groups.forEach((g) =>
      g.tasks.forEach((t) => {
        [t, ...(t.children || [])].forEach((task) => {
          if (!task.start || !task.end) return;
          const s = parseISO(task.start);
          const e = parseISO(task.end);
          if (!min || s < min) min = s;
          if (!max || e > max) max = e;
        });
      })
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!min) min = addDays(today, -3);
    if (!max) max = addDays(today, 11);
    return { rangeStart: addDays(min, -3), rangeEnd: addDays(max, 3) };
  }, [groups]);

  if (rows.length === 0) {
    return (
      <div className="view-scroll">
        <div className="view-placeholder">{t("gantt.emptyState")}</div>
      </div>
    );
  }

  return (
    <div className="gnt-root">
      <GanttToolbar
        zoomPct={Math.round((dayWidth / DAY_WIDTH_LEVELS[DEFAULT_ZOOM_INDEX]) * 100)}
        onZoomIn={() => setZoomIndex((i) => Math.min(i + 1, DAY_WIDTH_LEVELS.length - 1))}
        onZoomOut={() => setZoomIndex((i) => Math.max(i - 1, 0))}
        onZoomReset={() => setZoomIndex(DEFAULT_ZOOM_INDEX)}
      />

      <div className="gnt-body">
        <GanttSidebar rows={rows} onToggleGroup={toggleGroup} />
        <GanttTimeline
          rows={rows}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          dayWidth={dayWidth}
          tag={tag}
          onChangeTask={updateTask}
          onOpenTask={onTaskClick || setPeekTask}
        />
      </div>

      {!onTaskClick && peekTask && (
        <div className="gnt-peek">
          <div className="gnt-peek-title">{peekTask.title}</div>
          <div className="gnt-peek-dates">{peekTask.start} → {peekTask.end}</div>
          <button type="button" className="gnt-peek-close" onClick={() => setPeekTask(null)}>×</button>
        </div>
      )}

      <GanttLegend meta={meta} statusKeys={legendStatusKeys} iconKeys={legendIconKeys} />
    </div>
  );
}
