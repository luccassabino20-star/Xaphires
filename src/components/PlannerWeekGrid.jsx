import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { localeTag } from "../i18n/locale.js";
import { toISODate } from "../utils/calendarGrid.js";
import {
  HORA_INICIO,
  HORA_FIM,
  PASSO_MIN,
  TOTAL_SLOTS,
  SLOT_ALTURA,
  paraMinutos,
  minutosParaHora,
  slotDoHorario,
  weekDays,
  calcularRaias,
} from "../utils/timeGrid.js";

// Grade semanal por horário - mesma técnica de src/modules/saude-clinicas/AgendaView.jsx
// (slots de 15min como botões clicáveis por baixo, blocos absolutos por cima,
// raias pra sobreposição), portada sem o que é específico de agendamento de
// clínica. Arrastar (mover/redimensionar um bloco, ou soltar um item "sem
// horário" do painel lateral aqui dentro) usa pointer events + elementFromPoint
// pra achar a coluna do dia - o mesmo padrão do AgendaView, não o
// draggable/onDragOver nativo que o quadro Kanban usa (esse é melhor pra
// listas lado a lado; aqui o alvo é uma grade de pixels, elementFromPoint
// resolve isso sozinho tanto pro card existente quanto pro item do painel).
export default function PlannerWeekGrid({
  weekAnchor,
  tasks,
  canUse,
  todayIso,
  dragPreview,
  onSlotClick,
  onOpenTask,
  onStartDrag,
  onStartResize,
}) {
  const { i18n } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  // Linha de "agora" recalculada a cada minuto - não precisa de mais
  // frequência que isso pra uma agenda pessoal.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const dias = useMemo(() => weekDays(weekAnchor), [weekAnchor]);
  const slots = useMemo(
    () => Array.from({ length: TOTAL_SLOTS }, (_, i) => minutosParaHora(HORA_INICIO + i * PASSO_MIN)),
    []
  );

  const weekdayFmt = useMemo(() => new Intl.DateTimeFormat(localeTag(i18n.language), { weekday: "short" }), [i18n.language]);

  const minutosAgora = now.getHours() * 60 + now.getMinutes();
  const mostrarLinhaAgora = minutosAgora >= HORA_INICIO && minutosAgora <= HORA_FIM;
  const topLinhaAgora = ((minutosAgora - HORA_INICIO) / PASSO_MIN) * SLOT_ALTURA;

  return (
    <div className="planner-week-grid">
      <div className="planner-week-gutter">
        <div className="planner-week-header-cell" />
        {slots.map((s, i) => (
          <div
            key={s}
            className={"planner-week-gutter-slot" + (s.endsWith(":00") ? " hour" : "")}
            style={{ top: i * SLOT_ALTURA }}
          >
            {s.endsWith(":00") && <span>{s}</span>}
          </div>
        ))}
      </div>

      {dias.map((dia) => {
        const iso = toISODate(dia);
        const ehHoje = iso === todayIso;
        const itensBrutos = (tasks || []).filter((tsk) => tsk.due === iso && !tsk.allDay && tsk.startTime);
        const comMinutos = itensBrutos.map((tsk) => ({
          id: tsk.id,
          tarefa: tsk,
          inicioMin: paraMinutos(tsk.startTime),
          fimMin: paraMinutos(tsk.startTime) + (tsk.durationMin || 60),
        }));
        const raias = calcularRaias(comMinutos);

        return (
          <div key={iso} className={"planner-week-day" + (ehHoje ? " today" : "")}>
            <div className="planner-week-day-header">
              <span className="planner-week-day-weekday">{weekdayFmt.format(dia)}</span>
              <span className={"planner-week-day-num" + (ehHoje ? " today" : "")}>{dia.getDate()}</span>
            </div>
            <div className="planner-week-day-body" data-iso={iso} style={{ height: TOTAL_SLOTS * SLOT_ALTURA }}>
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={"planner-week-slot" + (s.endsWith(":00") ? " hour" : "")}
                  style={{ top: slotDoHorario(s) * SLOT_ALTURA, height: SLOT_ALTURA }}
                  onClick={() => canUse && onSlotClick(iso, s)}
                  disabled={!canUse}
                  title={s}
                />
              ))}

              {comMinutos
                .filter((it) => !dragPreview || dragPreview.taskId !== it.id)
                .map((it) => {
                  const { raia, totalRaias } = raias.get(it.id);
                  const largura = 100 / totalRaias;
                  const tsk = it.tarefa;
                  const style = {
                    top: slotDoHorario(tsk.startTime) * SLOT_ALTURA,
                    height: Math.max(1, (tsk.durationMin || 60) / PASSO_MIN) * SLOT_ALTURA,
                    left: `${raia * largura}%`,
                    width: `calc(${largura}% - 3px)`,
                  };
                  return (
                    <button
                      type="button"
                      key={tsk.id}
                      className={"planner-week-block type-" + (tsk.type || "task") + (tsk.completed ? " completed" : "")}
                      style={style}
                      onPointerDown={canUse ? (e) => onStartDrag(e, tsk) : undefined}
                      onClick={() => onOpenTask(tsk.id)}
                    >
                      <span className="planner-week-block-time">
                        {tsk.startTime}–{minutosParaHora(paraMinutos(tsk.startTime) + (tsk.durationMin || 60))}
                      </span>
                      <span className="planner-week-block-title">{tsk.title}</span>
                      {canUse && (
                        <span
                          className="planner-week-block-resize"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            onStartResize(e, tsk);
                          }}
                        />
                      )}
                    </button>
                  );
                })}

              {dragPreview && dragPreview.iso === iso && (
                <div
                  className="planner-week-block planner-week-block-preview"
                  style={{
                    top: dragPreview.slot * SLOT_ALTURA,
                    height: dragPreview.duracaoSlots * SLOT_ALTURA,
                    left: 0,
                    width: "calc(100% - 3px)",
                  }}
                >
                  <span className="planner-week-block-time">
                    {minutosParaHora(HORA_INICIO + dragPreview.slot * PASSO_MIN)}–
                    {minutosParaHora(HORA_INICIO + (dragPreview.slot + dragPreview.duracaoSlots) * PASSO_MIN)}
                  </span>
                  <span className="planner-week-block-title">{dragPreview.title}</span>
                </div>
              )}

              {ehHoje && mostrarLinhaAgora && <div className="planner-now-line" style={{ top: topLinhaAgora }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
