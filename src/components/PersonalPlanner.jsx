import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../state/api.js";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import { localeTag } from "../i18n/locale.js";
import { weekdayNames, monthNames, toISODate, buildGrid } from "../utils/calendarGrid.js";
import DatePicker from "./DatePicker.jsx";

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

function formatDue(iso, lng) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const base = new Intl.DateTimeFormat(localeTag(lng), { day: "2-digit", month: "2-digit" }).format(date);
  return date.getFullYear() === new Date().getFullYear() ? base : `${base}/${y}`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Agenda pessoal: tarefas fora de qualquer quadro, só de quem está logado (ver
// personal_tasks no servidor). Duas abas sobre o mesmo dado - Planejador abre
// aqui na aba Calendário, Minhas tarefas abre na aba de lista - porque são a
// mesma coisa vista de dois jeitos, não duas telas com fonte própria.
export default function PersonalPlanner({ onClose, initialTab = "calendar" }) {
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
  const [addingDate, setAddingDate] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState(() => toISODate(new Date()));
  const [submitting, setSubmitting] = useState(false);

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
    setMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
  }
  function goPrev() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function goNext() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

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
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-wide">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>
        <div className="modal-header">
          <span className="planner-header-icon">
            <CalendarBadgeIcon />
          </span>
          <div className="planner-header-text">
            <h2 className="members-modal-title">{t("planner.title")}</h2>
            <p className="planner-header-subtitle">{t("planner.subtitle")}</p>
          </div>
        </div>
        <nav className="planner-tabs">
          <button type="button" className={"planner-tab" + (tab === "calendar" ? " active" : "")} onClick={() => setTab("calendar")}>
            {t("planner.tabCalendar")}
          </button>
          <button type="button" className={"planner-tab" + (tab === "list" ? " active" : "")} onClick={() => setTab("list")}>
            {t("planner.tabList")}
          </button>
        </nav>
        <div className="modal-body">
          {loading ? (
            <p className="share-empty">{t("common.loading")}</p>
          ) : (
            <>
              {/* Recurso do Intermediário para cima (plans.js canUsePersonalPlanner) -
                  quem caiu de plano continua vendo e podendo apagar o que já criou,
                  só não cria nem edita nada novo. Mesmo padrão de RecurrencesModal. */}
              {!canUse && <p className="recurrence-locked">{t("planner.planRequired")}</p>}
              {tab === "calendar" ? (
                <>
                  <div className="calendar-header">
                    <div className="calendar-title">
                      {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
                    </div>
                    <div className="calendar-nav">
                      <button type="button" className="btn-ghost btn-small" onClick={goToday}>
                        {t("views.calendar.today")}
                      </button>
                      <button type="button" className="icon-btn" onClick={goPrev} aria-label={t("views.calendar.prevMonth")}>
                        <svg viewBox="0 0 24 24" width="16" height="16">
                          <path fill="currentColor" d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" />
                        </svg>
                      </button>
                      <button type="button" className="icon-btn" onClick={goNext} aria-label={t("views.calendar.nextMonth")}>
                        <svg viewBox="0 0 24 24" width="16" height="16">
                          <path fill="currentColor" d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4L13.2 12z" />
                        </svg>
                      </button>
                    </div>
                  </div>

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
                                className={"calendar-card-chip" + (tsk.completed ? " completed" : "")}
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
                </>
              ) : (
                <>
                  {canUse && (
                    <form className="planner-list-add" onSubmit={handleFormAdd}>
                      <input
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
                          {g.items.map((tsk) => (
                            <li key={tsk.id} className={"planner-task-row" + (tsk.completed ? " completed" : "")}>
                              <button
                                type="button"
                                className={"planner-task-check" + (tsk.completed ? " checked" : "")}
                                onClick={() => toggleTask(tsk)}
                                disabled={!canUse}
                                aria-label={tsk.completed ? t("board.cardItem.markIncomplete") : t("board.cardItem.markComplete")}
                              >
                                {tsk.completed && <CheckMarkIcon />}
                              </button>
                              <span className={"planner-task-title" + (tsk.completed ? " completed" : "")}>{tsk.title}</span>
                              <span className={"planner-task-due" + (g.key === "overdue" ? " overdue" : "")}>
                                {formatDue(tsk.due, i18n.language)}
                              </span>
                              <button type="button" className="planner-task-delete" onClick={() => removeTask(tsk)} aria-label={t("common.delete")}>
                                <TrashIcon />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
