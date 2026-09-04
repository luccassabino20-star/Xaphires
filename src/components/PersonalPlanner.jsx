import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../state/api.js";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import { localeTag } from "../i18n/locale.js";
import { weekdayNames, monthNames, toISODate, buildGrid } from "../utils/calendarGrid.js";
import { HORA_INICIO, PASSO_MIN, TOTAL_SLOTS, SLOT_ALTURA, minutosParaHora, slotDoHorario, weekDays } from "../utils/timeGrid.js";
import DatePicker from "./DatePicker.jsx";
import PersonalTaskDetailModal from "./PersonalTaskDetailModal.jsx";
import PlannerWeekGrid from "./PlannerWeekGrid.jsx";
import PlannerSidebar from "./PlannerSidebar.jsx";

function CalendarBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19">
      <path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm12 8v9H5v-9z" />
    </svg>
  );
}
function CheckMarkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12">
      <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
    </svg>
  );
}
function ChecklistIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m3 6 1.5 1.5L7 5m-4 7 1.5 1.5L7 11m-4 7 1.5 1.5L7 17M10 6h11M10 12h11M10 18h11"
      />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3zm2 5h2v10h-2zm-4 0h2v10H7zm8 0h2v10h-2z" />
    </svg>
  );
}
function EmptyPlannerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40">
      <path
        fill="currentColor"
        d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm12 8v9H5v-9zm-9 2.5-3 3 1.4 1.4L11 15.3l3.6 3.6L16 17.5l-3-3 3-3-1.4-1.4L11 13.5l-1.6-1.6z"
      />
    </svg>
  );
}
function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15">
      <path fill="currentColor" d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15">
      <path fill="currentColor" d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4L13.2 12z" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function formatDue(iso, lng) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const base = new Intl.DateTimeFormat(localeTag(lng), { day: "2-digit", month: "2-digit" }).format(date);
  return date.getFullYear() === new Date().getFullYear() ? base : `${base}/${y}`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

const TABS = ["week", "month", "list"];

// Agenda pessoal: tarefas fora de qualquer quadro, só de quem está logado (ver
// personal_tasks no servidor). Três abas sobre o mesmo dado - Semana (grade
// por horário, a visão principal), Mês (calendário) e Lista - porque são a
// mesma coisa vista de três jeitos, não telas com fonte própria cada.
//
// Página cheia dentro de .main-area (ver AuthenticatedApp.jsx), não modal -
// sem overlay, sem X, sem onClose: sair daqui é navegar pra outro lugar
// (rail "Início" ou escolher um quadro), a mesma lógica de qualquer página.
export default function PersonalPlanner({ initialTab = "week" }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const WEEKDAYS = useMemo(() => weekdayNames(i18n.language), [i18n.language]);
  const MONTH_NAMES = useMemo(() => monthNames(i18n.language), [i18n.language]);

  const [tab, setTab] = useState(initialTab);
  const [tasks, setTasks] = useState([]);
  const [canUse, setCanUse] = useState(false);
  const [loading, setLoading] = useState(true);
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [addingDate, setAddingDate] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState(() => toISODate(new Date()));
  const [detailTaskId, setDetailTaskId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragPreview, setDragPreview] = useState(null); // {taskId, iso, slot, duracaoSlots, title}
  // Foco automático do campo de título ao trocar para a aba de lista pelo
  // botão "+ Nova tarefa" do topo - só nesse caminho (não quando a pessoa
  // clica na aba "Minhas tarefas" na mão, o que roubaria o foco sem pedir).
  const [focusAddOnList, setFocusAddOnList] = useState(false);
  const newTitleInputRef = useRef(null);
  // Distingue clique de arraste no fim do gesto de pointer (mesma técnica de
  // AgendaView.jsx: um pointerup sem movimento real ainda dispara onClick no
  // elemento, e sem essa flag abriria o editor bem na hora em que a pessoa só
  // queria mover o bloco).
  const arrastouRef = useRef(false);

  useEffect(() => {
    api
      .listPersonalTasks()
      .then((data) => {
        setTasks(data.tasks);
        setCanUse(data.canUse);
      })
      .catch((err) => showToast(translateError(err, t)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tasksByDate = useMemo(() => {
    const map = {};
    tasks.forEach((tsk) => {
      (map[tsk.due] ||= []).push(tsk);
    });
    return map;
  }, [tasks]);

  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0)), [tasks]);

  const grid = useMemo(() => buildGrid(monthDate), [monthDate]);
  const todayIso = toISODate(new Date());
  const tomorrowIso = useMemo(() => {
    const now = new Date();
    return toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  }, []);

  // Agrupada como as agendas pessoais costumam ser (Atrasadas/Hoje/Amanhã/Em
  // breve), com concluídas por último e desaparecendo da contagem "atrasada" -
  // é o que faz a lista comunicar prioridade de cara, em vez de só listar por
  // data crua.
  const groups = useMemo(() => {
    const buckets = { overdue: [], today: [], tomorrow: [], upcoming: [], completed: [] };
    sortedTasks.forEach((tsk) => {
      if (tsk.completed) {
        buckets.completed.push(tsk);
        return;
      }
      if (tsk.due < todayIso) buckets.overdue.push(tsk);
      else if (tsk.due === todayIso) buckets.today.push(tsk);
      else if (tsk.due === tomorrowIso) buckets.tomorrow.push(tsk);
      else buckets.upcoming.push(tsk);
    });
    return ["overdue", "today", "tomorrow", "upcoming", "completed"]
      .map((key) => ({ key, items: buckets[key] }))
      .filter((g) => g.items.length > 0);
  }, [sortedTasks, todayIso, tomorrowIso]);

  function goToday() {
    const now = new Date();
    if (tab === "week") setWeekAnchor(now);
    else setMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
  }
  function goPrev() {
    if (tab === "week") setWeekAnchor((d) => addDays(d, -7));
    else setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function goNext() {
    if (tab === "week") setWeekAnchor((d) => addDays(d, 7));
    else setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
  function handleQuickCreate() {
    setFocusAddOnList(true);
    setTab("list");
  }
  function handleToolbarAdd() {
    if (tab === "week") createAndOpen({ due: toISODate(weekAnchor), allDay: false, startTime: "09:00" });
    else handleQuickCreate();
  }
  // Roda depois do commit da troca de aba (não na hora do clique) - o campo
  // do formulário de "Minhas tarefas" só existe no DOM depois que `tab` virou
  // "list" de verdade, então focar antes disso não acha o ref.
  useEffect(() => {
    if (tab === "list" && focusAddOnList) {
      newTitleInputRef.current?.focus();
      setFocusAddOnList(false);
    }
  }, [tab, focusAddOnList]);

  async function addTask(due, title) {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const criada = await api.createPersonalTask({ title: trimmed, due });
      setTasks((atual) => [...atual, criada]);
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  // Criação "nasce já editável": cria a tarefa com um título provisório e
  // abre o editor na hora - mesmo espírito de Notion/Linear (clicar cria e
  // já deixa digitar o nome de verdade), em vez de inventar um rascunho
  // local que só vira tarefa de verdade num segundo passo.
  async function createAndOpen(opts = {}) {
    try {
      const criada = await api.createPersonalTask({
        title: t("planner.untitled"),
        due: opts.due || todayIso,
        priority: opts.priority,
        allDay: opts.allDay,
        startTime: opts.startTime,
      });
      setTasks((atual) => [...atual, criada]);
      setDetailTaskId(criada.id);
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function handleQuickAdd(iso) {
    const title = draftTitle;
    setDraftTitle("");
    setAddingDate(null);
    if (title.trim()) await addTask(iso, title);
  }

  async function handleFormAdd(e) {
    e.preventDefault();
    if (!newTitle.trim() || !newDue || submitting) return;
    setSubmitting(true);
    await addTask(newDue, newTitle);
    setNewTitle("");
    setSubmitting(false);
  }

  async function toggleTask(tsk) {
    try {
      const atualizada = await api.updatePersonalTask(tsk.id, { completed: !tsk.completed });
      setTasks((atual) => atual.map((x) => (x.id === tsk.id ? atualizada : x)));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function removeTask(tsk) {
    if (!confirm(t("planner.deleteConfirm", { title: tsk.title }))) return;
    try {
      await api.deletePersonalTask(tsk.id);
      setTasks((atual) => atual.filter((x) => x.id !== tsk.id));
      setDetailTaskId((atual) => (atual === tsk.id ? null : atual));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  function handleDetailChange(atualizada) {
    setTasks((atual) => atual.map((x) => (x.id === atualizada.id ? atualizada : x)));
  }

  // Abre o editor, exceto quando o clique é o fim de um arraste (ver
  // arrastouRef) - passado como onOpenTask tanto pra grade semanal quanto
  // pro painel lateral, os dois lugares de onde um arraste pode começar.
  function openTaskIfNotDragged(id) {
    if (arrastouRef.current) {
      arrastouRef.current = false;
      return;
    }
    setDetailTaskId(id);
  }

  async function commitTiming(taskId, patch) {
    try {
      const atualizada = await api.updatePersonalTask(taskId, patch);
      setTasks((atual) => atual.map((x) => (x.id === taskId ? atualizada : x)));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  // Mover um bloco (ou agendar um item "sem horário" do painel lateral,
  // mesmo caminho - a diferença entre os dois é só se a tarefa já tinha
  // horário antes, o commit final é idêntico) - pointer events +
  // elementFromPoint pra achar a coluna do dia, mesma técnica de
  // AgendaView.jsx (iniciarArrastoAgendamento), não o draggable/onDragOver
  // nativo do quadro Kanban (que é melhor pra listas lado a lado, não pra uma
  // grade de pixels).
  function startDrag(e, tsk) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastouRef.current = false;
    const startX = e.clientX;
    const startY = e.clientY;
    const cardRect = e.currentTarget.getBoundingClientRect();
    const grabOffsetY = startY - cardRect.top;
    const duracaoMin = tsk.durationMin || 60;
    const duracaoSlots = Math.max(1, Math.round(duracaoMin / PASSO_MIN));
    let arrastando = false;

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!arrastando && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      arrastando = true;
      arrastouRef.current = true;
      document.body.style.cursor = "grabbing";
      const alvo = document.elementFromPoint(ev.clientX, ev.clientY);
      const dayEl = alvo && alvo.closest(".planner-week-day-body");
      if (!dayEl) return;
      const dayRect = dayEl.getBoundingClientRect();
      const iso = dayEl.dataset.iso;
      const localY = ev.clientY - dayRect.top - grabOffsetY;
      let slot = Math.round(localY / SLOT_ALTURA);
      slot = Math.max(0, Math.min(slot, TOTAL_SLOTS - duracaoSlots));
      setDragPreview({ taskId: tsk.id, iso, slot, duracaoSlots, title: tsk.title });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      if (!arrastando) {
        setDragPreview(null);
        return;
      }
      setDragPreview((atual) => {
        if (atual) {
          commitTiming(tsk.id, {
            due: atual.iso,
            allDay: false,
            startTime: minutosParaHora(HORA_INICIO + atual.slot * PASSO_MIN),
            durationMin: atual.duracaoSlots * PASSO_MIN,
          });
        }
        return null;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Redimensionar (puxar a borda de baixo do bloco): só muda a duração,
  // sempre no mesmo dia/horário de início - mesmo par
  // iniciarRedimensionamento de AgendaView.jsx.
  function startResize(e, tsk) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastouRef.current = false;
    const dayEl = e.currentTarget.closest(".planner-week-day-body");
    const iso = dayEl?.dataset.iso || tsk.due;
    const inicioSlot = slotDoHorario(tsk.startTime || "09:00");
    const startY = e.clientY;
    let arrastando = false;

    function onMove(ev) {
      if (!arrastando && Math.abs(ev.clientY - startY) < 4) return;
      arrastando = true;
      arrastouRef.current = true;
      document.body.style.cursor = "ns-resize";
      const dayRect = dayEl.getBoundingClientRect();
      const localY = ev.clientY - dayRect.top;
      let fimSlot = Math.round(localY / SLOT_ALTURA);
      fimSlot = Math.max(inicioSlot + 1, Math.min(fimSlot, TOTAL_SLOTS));
      setDragPreview({ taskId: tsk.id, iso, slot: inicioSlot, duracaoSlots: fimSlot - inicioSlot, title: tsk.title });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      setDragPreview((atual) => {
        if (atual) commitTiming(tsk.id, { durationMin: atual.duracaoSlots * PASSO_MIN });
        return null;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const detailTask = tasks.find((x) => x.id === detailTaskId) || null;
  const segIndex = TABS.indexOf(tab);

  const weekDaysList = useMemo(() => weekDays(weekAnchor), [weekAnchor]);
  const weekRangeLabel = useMemo(() => {
    const inicio = weekDaysList[0];
    const fim = weekDaysList[6];
    const fmt = new Intl.DateTimeFormat(localeTag(i18n.language), { day: "2-digit", month: "short" });
    return `${fmt.format(inicio)} – ${fmt.format(fim)}`;
  }, [weekDaysList, i18n.language]);

  return (
    <div className="planner-page">
      <div className="planner-modal-header">
          <div className="planner-modal-heading">
            <span className="planner-header-icon">
              <CalendarBadgeIcon />
            </span>
            <div className="planner-header-text">
              <h2 className="planner-modal-title">{t("planner.title")}</h2>
              <p className="planner-modal-subtitle">{t("planner.subtitle")}</p>
            </div>
          </div>
          <div className="planner-segmented" role="tablist" style={{ "--seg-count": TABS.length }}>
            {TABS.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={tab === v}
                className={"planner-segment" + (tab === v ? " active" : "")}
                onClick={() => setTab(v)}
              >
                {t(`planner.tab${capitalize(v)}`)}
              </button>
            ))}
            <span className="planner-segment-thumb" style={{ "--seg-count": TABS.length, "--seg-index": segIndex }} aria-hidden="true" />
          </div>
        </div>

        {(tab === "week" || tab === "month") && (
          <div className="planner-toolbar">
            <div className="planner-month-nav">
              <button type="button" className="planner-nav-arrow" onClick={goPrev} aria-label={t("views.calendar.prevMonth")}>
                <ChevronLeftIcon />
              </button>
              <span className="planner-month-title">
                {tab === "week" ? weekRangeLabel : `${capitalize(MONTH_NAMES[monthDate.getMonth()])} ${monthDate.getFullYear()}`}
              </span>
              <button type="button" className="planner-nav-arrow" onClick={goNext} aria-label={t("views.calendar.nextMonth")}>
                <ChevronRightIcon />
              </button>
            </div>
            <div className="planner-toolbar-actions">
              <button type="button" className="planner-today-pill" onClick={goToday}>
                {t("views.calendar.today")}
              </button>
              {canUse && (
                <button type="button" className="planner-quickadd-btn" onClick={handleToolbarAdd}>
                  <PlusIcon />
                  {t("planner.add")}
                </button>
              )}
            </div>
          </div>
        )}

        <div className={"planner-modal-body" + (tab === "week" ? " planner-modal-body-week" : "")}>
          {loading ? (
            <p className="share-empty">{t("common.loading")}</p>
          ) : (
            <>
              {/* Recurso do Profissional para cima (plans.js canUsePersonalPlanner) -
                  quem caiu de plano continua vendo e podendo apagar o que já criou,
                  só não cria nem edita nada novo. Mesmo padrão de RecurrencesModal. */}
              {!canUse && <p className="recurrence-locked">{t("planner.planRequired")}</p>}
              {tab === "week" && (
                <div className="planner-week-body">
                  <PlannerSidebar
                    tasks={tasks}
                    canUse={canUse}
                    todayIso={todayIso}
                    onOpenTask={openTaskIfNotDragged}
                    onQuickCreate={(opts) => createAndOpen({ due: todayIso, ...opts })}
                    onStartDrag={startDrag}
                  />
                  <PlannerWeekGrid
                    weekAnchor={weekAnchor}
                    tasks={tasks}
                    canUse={canUse}
                    todayIso={todayIso}
                    dragPreview={dragPreview}
                    onSlotClick={(iso, time) => createAndOpen({ due: iso, allDay: false, startTime: time })}
                    onOpenTask={openTaskIfNotDragged}
                    onStartDrag={startDrag}
                    onStartResize={startResize}
                    onToggleComplete={toggleTask}
                  />
                </div>
              )}
              {tab === "month" && (
                <div className="calendar-grid planner-grid">
                  {WEEKDAYS.map((w) => (
                    <div key={w} className="calendar-weekday">
                      {w}
                    </div>
                  ))}
                  {grid.map(({ date, inMonth }) => {
                    const iso = toISODate(date);
                    const dayTasks = tasksByDate[iso] || [];
                    const isToday = iso === todayIso;
                    return (
                      <div key={iso} className={"calendar-cell" + (inMonth ? "" : " outside") + (isToday ? " today" : "")}>
                        <div className="calendar-day-num-row">
                          <span className="calendar-day-num">{date.getDate()}</span>
                          {canUse && (
                            <button
                              type="button"
                              className="planner-day-add"
                              aria-label={t("planner.add")}
                              onClick={() => {
                                setAddingDate(iso);
                                setDraftTitle("");
                              }}
                            >
                              +
                            </button>
                          )}
                        </div>
                        <div className="calendar-day-cards">
                          {dayTasks.map((tsk) => (
                            <button
                              key={tsk.id}
                              className={
                                "calendar-card-chip" +
                                (tsk.color ? " color-" + tsk.color : "") +
                                (tsk.completed ? " completed" : "")
                              }
                              onClick={() => toggleTask(tsk)}
                              disabled={!canUse}
                              title={tsk.title}
                            >
                              {tsk.title}
                            </button>
                          ))}
                        </div>
                        {addingDate === iso && (
                          <form className="planner-inline-add" onSubmit={(e) => e.preventDefault()}>
                            <input
                              autoFocus
                              value={draftTitle}
                              onChange={(e) => setDraftTitle(e.target.value)}
                              onBlur={() => handleQuickAdd(iso)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleQuickAdd(iso);
                                }
                                if (e.key === "Escape") setAddingDate(null);
                              }}
                              placeholder={t("planner.addPlaceholder")}
                            />
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {tab === "list" && (
                <>
                  {canUse && (
                    <form className="planner-list-add" onSubmit={handleFormAdd}>
                      <input
                        ref={newTitleInputRef}
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder={t("planner.addPlaceholder")}
                      />
                      <DatePicker value={newDue} onChange={setNewDue} label={t("board.cardModal.dueDate")} showRecurrence={false} />
                      <button className="btn-primary btn-small" type="submit" disabled={submitting || !newTitle.trim()}>
                        {t("planner.add")}
                      </button>
                    </form>
                  )}

                  {sortedTasks.length === 0 ? (
                    <div className="planner-empty">
                      <EmptyPlannerIcon />
                      <p>{t("planner.empty")}</p>
                    </div>
                  ) : (
                    groups.map((g) => (
                      <div className="planner-group" key={g.key}>
                        <div className={"planner-group-title" + (g.key === "overdue" ? " overdue" : "")}>
                          {t(`planner.group${capitalize(g.key)}`)}
                          <span className="planner-group-count">{g.items.length}</span>
                        </div>
                        <ul className="planner-task-list">
                          {g.items.map((tsk) => {
                            const checklistDone = (tsk.checklist || []).filter((i) => i.done).length;
                            const checklistTotal = (tsk.checklist || []).length;
                            return (
                              <li
                                key={tsk.id}
                                className={
                                  "planner-task-row" +
                                  (tsk.color ? " color-" + tsk.color : "") +
                                  (tsk.completed ? " completed" : "")
                                }
                                onClick={() => setDetailTaskId(tsk.id)}
                              >
                                <button
                                  type="button"
                                  className={"planner-task-check" + (tsk.completed ? " checked" : "")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTask(tsk);
                                  }}
                                  disabled={!canUse}
                                  aria-label={tsk.completed ? t("board.cardItem.markIncomplete") : t("board.cardItem.markComplete")}
                                >
                                  {tsk.completed && <CheckMarkIcon />}
                                </button>
                                <span className={"planner-task-title" + (tsk.completed ? " completed" : "")}>{tsk.title}</span>
                                <div className="planner-task-badges">
                                  <span className={"priority-badge priority-" + (tsk.priority || "medium")}>
                                    <span className="priority-badge-dot" aria-hidden="true" />
                                    {t(`planner.priority.${tsk.priority || "medium"}`)}
                                  </span>
                                  {checklistTotal > 0 && (
                                    <span
                                      className={"planner-task-checklist-badge" + (checklistDone === checklistTotal ? " all-done" : "")}
                                      title={t("planner.subtasksProgress", { done: checklistDone, total: checklistTotal })}
                                    >
                                      <ChecklistIcon />
                                      {checklistDone}/{checklistTotal}
                                    </span>
                                  )}
                                  <span className={"planner-task-due" + (g.key === "overdue" ? " overdue" : "")}>
                                    {formatDue(tsk.due, i18n.language)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="planner-task-delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeTask(tsk);
                                  }}
                                  aria-label={t("common.delete")}
                                >
                                  <TrashIcon />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))
                  )}
                </>
              )}
            </>
          )}
        </div>
      {detailTask && (
        <PersonalTaskDetailModal
          task={detailTask}
          canUse={canUse}
          onClose={() => setDetailTaskId(null)}
          onChange={handleDetailChange}
        />
      )}
    </div>
  );
}

