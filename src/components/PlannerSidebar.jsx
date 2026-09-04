import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toISODate } from "../utils/calendarGrid.js";

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}
function ChevronIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease" }}>
      <path fill="currentColor" d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4L13.2 12z" />
    </svg>
  );
}

function Accordion({ title, count, open, onToggle, children }) {
  return (
    <div className="planner-accordion">
      <button type="button" className="planner-accordion-head" onClick={onToggle}>
        <ChevronIcon open={open} />
        <span>{title}</span>
        {count > 0 && <span className="planner-accordion-count">{count}</span>}
      </button>
      {open && <div className="planner-accordion-body">{children}</div>}
    </div>
  );
}

// Painel esquerdo da aba Semana: prioridades, filtros rápidos e a lista de
// tarefas "sem horário" (o backlog arrastável pra grade - substitui os
// cartões de quadro sem data do pedido original, já que este planejador não
// tem ligação com o Kanban). Todo o dado aqui é real (deriva de `tasks`, que
// já vem carregado em PersonalPlanner) - nada de seção fantasma sem
// funcionalidade por trás.
export default function PlannerSidebar({ tasks, canUse, todayIso, onOpenTask, onQuickCreate, onStartDrag }) {
  const { t } = useTranslation();
  const [openToday, setOpenToday] = useState(true);
  const [openWeek, setOpenWeek] = useState(false);

  const prioritarias = useMemo(
    () => tasks.filter((tsk) => tsk.priority === "high" && !tsk.completed).sort((a, b) => (a.due < b.due ? -1 : 1)),
    [tasks]
  );

  const semHorario = useMemo(() => tasks.filter((tsk) => tsk.allDay && !tsk.completed), [tasks]);

  const sevenDaysIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toISODate(d);
  }, []);

  const hojeEAtrasadas = useMemo(
    () => tasks.filter((tsk) => !tsk.completed && tsk.due <= todayIso).sort((a, b) => (a.due < b.due ? -1 : 1)),
    [tasks, todayIso]
  );
  const proximos7Dias = useMemo(
    () => tasks.filter((tsk) => !tsk.completed && tsk.due > todayIso && tsk.due <= sevenDaysIso).sort((a, b) => (a.due < b.due ? -1 : 1)),
    [tasks, todayIso, sevenDaysIso]
  );

  return (
    <div className="planner-sidebar">
      <div className="planner-sidebar-head">
        <span>{t("planner.title")}</span>
        {canUse && (
          <button type="button" className="planner-sidebar-add" onClick={() => onQuickCreate()} aria-label={t("planner.add")}>
            <PlusIcon />
          </button>
        )}
      </div>

      <div className="planner-sidebar-section">
        <div className="planner-sidebar-section-title">{t("planner.sidebar.priorities")}</div>
        {prioritarias.length === 0 ? (
          <div className="planner-sidebar-empty">
            <p>{t("planner.sidebar.prioritiesEmpty")}</p>
            {canUse && (
              <button type="button" className="planner-sidebar-empty-btn" onClick={() => onQuickCreate({ priority: "high" })}>
                <PlusIcon />
                {t("planner.sidebar.addPriority")}
              </button>
            )}
          </div>
        ) : (
          <ul className="planner-sidebar-list">
            {prioritarias.map((tsk) => (
              <li key={tsk.id} className="planner-sidebar-item" onClick={() => onOpenTask(tsk.id)}>
                <span className="priority-badge priority-high">
                  <span className="priority-badge-dot" aria-hidden="true" />
                </span>
                <span className="planner-sidebar-item-title">{tsk.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Accordion
        title={t("planner.sidebar.todayOverdue")}
        count={hojeEAtrasadas.length}
        open={openToday}
        onToggle={() => setOpenToday((v) => !v)}
      >
        {hojeEAtrasadas.length === 0 ? (
          <p className="planner-sidebar-empty-text">{t("planner.sidebar.todayOverdueEmpty")}</p>
        ) : (
          <ul className="planner-sidebar-list">
            {hojeEAtrasadas.map((tsk) => (
              <li key={tsk.id} className="planner-sidebar-item" onClick={() => onOpenTask(tsk.id)}>
                <span className={"planner-sidebar-dot" + (tsk.due < todayIso ? " overdue" : "")} aria-hidden="true" />
                <span className="planner-sidebar-item-title">{tsk.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Accordion>

      <Accordion
        title={t("planner.sidebar.next7Days")}
        count={proximos7Dias.length}
        open={openWeek}
        onToggle={() => setOpenWeek((v) => !v)}
      >
        {proximos7Dias.length === 0 ? (
          <p className="planner-sidebar-empty-text">{t("planner.sidebar.next7DaysEmpty")}</p>
        ) : (
          <ul className="planner-sidebar-list">
            {proximos7Dias.map((tsk) => (
              <li key={tsk.id} className="planner-sidebar-item" onClick={() => onOpenTask(tsk.id)}>
                <span className="planner-sidebar-dot" aria-hidden="true" />
                <span className="planner-sidebar-item-title">{tsk.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Accordion>

      <div className="planner-sidebar-section planner-sidebar-backlog">
        <div className="planner-sidebar-section-title">{t("planner.sidebar.unscheduled")}</div>
        {semHorario.length === 0 ? (
          <p className="planner-sidebar-empty-text">{t("planner.sidebar.unscheduledEmpty")}</p>
        ) : (
          <ul className="planner-sidebar-list">
            {semHorario.map((tsk) => (
              <li
                key={tsk.id}
                className="planner-sidebar-item planner-sidebar-backlog-item"
                onClick={() => onOpenTask(tsk.id)}
                onPointerDown={canUse ? (e) => onStartDrag(e, tsk) : undefined}
              >
                <span className="planner-sidebar-dot" aria-hidden="true" />
                <span className="planner-sidebar-item-title">{tsk.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
