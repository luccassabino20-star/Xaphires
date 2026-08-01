import { useRef, useState } from "react";
import { parseISO, diffDays, isoAddDays } from "./ganttDate.js";
import { MIN_BAR_WIDTH } from "./ganttConstants.js";
import { GANTT_STATUS, GANTT_LATE_COLOR } from "./ganttStatus.js";
import { GANTT_ICONS, IconWarning } from "./ganttIcons.jsx";

// Mover e redimensionar são Pointer Events com setPointerCapture, não o
// draggable/onDragStart do HTML5 que o resto do app usa para reordenar cartões
// (ver ListColumn.jsx) - aqui precisamos da posição contínua do cursor durante
// o gesto inteiro, inclusive fora dos limites da barra, e o DnD nativo não dá
// isso sem gambiarra de imagem fantasma.
export default function GanttBar({ task, rangeStart, dayWidth, onChange, onOpen, readOnly }) {
  const [dragMode, setDragMode] = useState(null); // null | "move" | "start" | "end"
  const dragState = useRef(null);
  const movedRef = useRef(false);

  if (!task.start || !task.end) return null;

  const startOffset = diffDays(rangeStart, parseISO(task.start));
  const endOffset = diffDays(rangeStart, parseISO(task.end)) + 1;
  const left = startOffset * dayWidth;
  const width = Math.max((endOffset - startOffset) * dayWidth, MIN_BAR_WIDTH);

  const meta = GANTT_STATUS[task.status] || GANTT_STATUS.todo;
  const color = meta.color || GANTT_STATUS.todo.color;

  function beginDrag(mode, e) {
    if (readOnly) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    movedRef.current = false;
    dragState.current = { mode, startX: e.clientX, origStart: task.start, origEnd: task.end };
    setDragMode(mode);
  }

  function onPointerMove(e) {
    const drag = dragState.current;
    if (!drag) return;
    const deltaPx = e.clientX - drag.startX;
    const deltaDays = Math.round(deltaPx / dayWidth);
    if (deltaDays === 0) return;
    movedRef.current = true;
    let nextStart = drag.origStart;
    let nextEnd = drag.origEnd;
    if (drag.mode === "move") {
      nextStart = isoAddDays(drag.origStart, deltaDays);
      nextEnd = isoAddDays(drag.origEnd, deltaDays);
    } else if (drag.mode === "start") {
      nextStart = isoAddDays(drag.origStart, deltaDays);
      if (nextStart > drag.origEnd) nextStart = drag.origEnd;
    } else if (drag.mode === "end") {
      nextEnd = isoAddDays(drag.origEnd, deltaDays);
      if (nextEnd < drag.origStart) nextEnd = drag.origStart;
    }
    onChange(task.id, { start: nextStart, end: nextEnd });
  }

  function endDrag() {
    dragState.current = null;
    setDragMode(null);
  }

  return (
    <button
      type="button"
      className={"gnt-bar" + (dragMode ? " dragging" : "") + (readOnly ? " gnt-bar-readonly" : "")}
      style={{ left, width, background: color }}
      onPointerDown={(e) => beginDrag("move", e)}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={() => !movedRef.current && onOpen?.(task)}
      title={`${task.title} (${task.start} → ${task.end})`}
    >
      {!readOnly && (
        <span
          className="gnt-bar-handle gnt-bar-handle-start"
          onPointerDown={(e) => beginDrag("start", e)}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      )}
      {task.late && (
        <span className="gnt-bar-late-badge" style={{ background: GANTT_LATE_COLOR }}>
          <IconWarning size={10} />
        </span>
      )}
      {(task.icons || []).map((key) => {
        const Icon = GANTT_ICONS[key];
        return Icon ? <Icon key={key} size={11} className="gnt-bar-icon" /> : null;
      })}
      <span className="gnt-bar-label">{task.title}</span>
      {!readOnly && (
        <span
          className="gnt-bar-handle gnt-bar-handle-end"
          onPointerDown={(e) => beginDrag("end", e)}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      )}
    </button>
  );
}
