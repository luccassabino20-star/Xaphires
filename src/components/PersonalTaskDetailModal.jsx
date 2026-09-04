import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import * as api from "../state/api.js";
import DatePicker from "./DatePicker.jsx";

function CheckMarkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12">
      <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
    </svg>
  );
}

// Ordem fixa alta->média->baixa, a mesma em que os chips aparecem no seletor
// e a única lista de valores válidos (espelha PRIORITIES em
// server/routes/personalTasks.js).
const PRIORITIES = ["high", "medium", "low"];
// Espelha TYPES em server/routes/personalTasks.js.
const TYPES = ["event", "task", "focus", "vacation"];
// Presets de duração comuns - não é a lista inteira de minutos possíveis (o
// servidor aceita qualquer inteiro de 5 a 1440), só os atalhos mais usados;
// o campo continua sendo um <input type="number"> de verdade por baixo.
const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];
// Espelha COLORS em server/routes/personalTasks.js.
const COLORS = ["teal", "blue", "purple", "amber", "rose"];

// Detalhes de uma tarefa pessoal: título, prazo, descrição e a checklist de
// subtarefas. Mesmo padrão de autosave do CardModal (onChange no estado local,
// onBlur grava) - "editável em tempo real" aqui é digitar direto no campo, sem
// modo de edição à parte, não sincronizar tecla a tecla com o servidor.
export default function PersonalTaskDetailModal({ task, canUse, onClose, onChange }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(task.due);
  const [description, setDescription] = useState(task.description || "");
  const [checklist, setChecklist] = useState(task.checklist || []);
  const [checklistText, setChecklistText] = useState("");
  const [priority, setPriority] = useState(task.priority || "medium");
  const [type, setType] = useState(task.type || "task");
  const [label, setLabel] = useState(task.label || "");
  const [allDay, setAllDay] = useState(task.allDay !== false);
  const [startTime, setStartTime] = useState(task.startTime || "09:00");
  const [durationMin, setDurationMin] = useState(task.durationMin || 60);
  const [color, setColor] = useState(task.color || null);
  const [tentative, setTentative] = useState(!!task.tentative);
  const [completed, setCompleted] = useState(!!task.completed);
  const readOnly = !canUse;

  // Troca de tarefa (o usuário fechou e abriu outra) - sem isso os campos
  // ficariam com o conteúdo da tarefa anterior até o próximo re-render.
  useEffect(() => {
    setTitle(task.title);
    setDue(task.due);
    setDescription(task.description || "");
    setChecklist(task.checklist || []);
    setPriority(task.priority || "medium");
    setType(task.type || "task");
    setLabel(task.label || "");
    setAllDay(task.allDay !== false);
    setStartTime(task.startTime || "09:00");
    setDurationMin(task.durationMin || 60);
    setColor(task.color || null);
    setTentative(!!task.tentative);
    setCompleted(!!task.completed);
  }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(patch) {
    try {
      const atualizada = await api.updatePersonalTask(task.id, patch);
      onChange(atualizada);
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  function commitTitle() {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(task.title);
      return;
    }
    if (trimmed !== task.title) persist({ title: trimmed });
  }

  function commitDescription() {
    if (description !== (task.description || "")) persist({ description });
  }

  function commitDue(novoDue) {
    setDue(novoDue);
    if (novoDue && novoDue !== task.due) persist({ due: novoDue });
  }

  function commitPriority(p) {
    if (p === priority) return;
    setPriority(p);
    persist({ priority: p });
  }

  function commitType(v) {
    if (v === type) return;
    setType(v);
    persist({ type: v });
  }

  function commitLabel() {
    if (label !== (task.label || "")) persist({ label });
  }

  // Os três campos de horário viajam juntos: "dia inteiro" zera o resto no
  // servidor de qualquer forma (ver updatePersonalTask), então nunca faz
  // sentido gravar allDay sozinho quando quem clicou foi o toggle - é sempre
  // a combinação inteira que muda de estado de uma vez.
  function commitAllDay(novoAllDay) {
    setAllDay(novoAllDay);
    persist(novoAllDay ? { allDay: true } : { allDay: false, startTime, durationMin });
  }

  function commitStartTime(v) {
    setStartTime(v);
    if (!allDay && v) persist({ startTime: v });
  }

  function commitDuration(v) {
    const min = Math.max(5, Math.min(1440, Math.round(v / 5) * 5));
    setDurationMin(min);
    if (!allDay) persist({ durationMin: min });
  }

  // Clicar de novo na cor já marcada tira a tag (volta pra null, a cor
  // derivada do type) - mesmo padrão de "clicar de novo desliga" que várias
  // pílulas de seleção única já usam neste app.
  function commitColor(c) {
    const proximo = color === c ? null : c;
    setColor(proximo);
    persist({ color: proximo });
  }

  function commitTentative(v) {
    setTentative(v);
    persist({ tentative: v });
  }

  function commitCompleted(v) {
    setCompleted(v);
    persist({ completed: v });
  }

  function addChecklistItem(e) {
    e.preventDefault();
    const texto = checklistText.trim();
    if (!texto) return;
    const proximo = [...checklist, { text: texto, done: false }];
    setChecklist(proximo);
    setChecklistText("");
    persist({ checklist: proximo });
  }

  function toggleChecklistItem(idx) {
    const proximo = checklist.map((item, i) => (i === idx ? { ...item, done: !item.done } : item));
    setChecklist(proximo);
    persist({ checklist: proximo });
  }

  function removeChecklistItem(idx) {
    const proximo = checklist.filter((_, i) => i !== idx);
    setChecklist(proximo);
    persist({ checklist: proximo });
  }

  function handleSaveAndClose() {
    commitTitle();
    commitDescription();
    onClose();
  }

  const done = checklist.filter((i) => i.done).length;
  const pct = checklist.length ? Math.round((done / checklist.length) * 100) : 0;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSaveAndClose();
      }}
    >
      <div className="modal">
        <button className="modal-close" onClick={handleSaveAndClose} aria-label={t("common.close")}>
          &times;
        </button>

        {!canUse && <p className="recurrence-locked">{t("planner.planRequired")}</p>}

        <div className="type-tabs">
          {TYPES.map((v) => (
            <button
              key={v}
              type="button"
              className={"type-tab" + (type === v ? " active" : "")}
              onClick={() => commitType(v)}
              disabled={readOnly}
              aria-pressed={type === v}
            >
              {t(`planner.type.${v}`)}
            </button>
          ))}
        </div>

        <div className="modal-header">
          <button
            type="button"
            className={"planner-task-check" + (completed ? " checked" : "")}
            onClick={() => commitCompleted(!completed)}
            disabled={readOnly}
            aria-label={completed ? t("board.cardItem.markIncomplete") : t("board.cardItem.markComplete")}
          >
            {completed && <CheckMarkIcon />}
          </button>
          <input
            className={"modal-title-input" + (completed ? " completed" : "")}
            value={title}
            readOnly={readOnly}
            spellCheck={false}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>

        <div className="modal-section">
          <label className="modal-label">{t("board.cardModal.dueDate")}</label>
          <DatePicker value={due} onChange={commitDue} disabled={readOnly} showRecurrence={false} />
        </div>

        <div className="modal-section">
          <label className="modal-label">{t("planner.startTimeLabel")}</label>
          <div className="timing-toggle">
            <button
              type="button"
              className={"timing-toggle-btn" + (allDay ? " active" : "")}
              onClick={() => commitAllDay(true)}
              disabled={readOnly}
            >
              {t("planner.allDay")}
            </button>
            <button
              type="button"
              className={"timing-toggle-btn" + (!allDay ? " active" : "")}
              onClick={() => commitAllDay(false)}
              disabled={readOnly}
            >
              {t("planner.timed")}
            </button>
          </div>
          {!allDay && (
            <div className="timing-fields">
              <input
                type="time"
                className="timing-time-input"
                value={startTime}
                disabled={readOnly}
                onChange={(e) => commitStartTime(e.target.value)}
              />
              <div className="duration-presets">
                {DURATION_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={"duration-preset" + (durationMin === m ? " active" : "")}
                    onClick={() => commitDuration(m)}
                    disabled={readOnly}
                  >
                    {m < 60 ? `${m}min` : `${m / 60}h`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="tentative-toggle-row">
            <span className="addon-toggle">
              <input type="checkbox" checked={tentative} disabled={readOnly} onChange={(e) => commitTentative(e.target.checked)} />
              <span className="addon-toggle-track">
                <span className="addon-toggle-thumb" />
              </span>
            </span>
            <span>{t("planner.tentativeLabel")}</span>
          </label>
        </div>

        <div className="modal-section">
          <label className="modal-label">{t("planner.priorityLabel")}</label>
          <div className="priority-picker">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className={"priority-chip priority-" + p + (priority === p ? " active" : "")}
                onClick={() => commitPriority(p)}
                disabled={readOnly}
                aria-pressed={priority === p}
              >
                <span className="priority-chip-dot" aria-hidden="true" />
                {t(`planner.priority.${p}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-section">
          <label className="modal-label">{t("planner.colorLabel")}</label>
          <div className="color-swatch-picker">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={"color-swatch color-swatch-" + c + (color === c ? " active" : "")}
                onClick={() => commitColor(c)}
                disabled={readOnly}
                aria-pressed={color === c}
                aria-label={t(`planner.colorTags.${c}`)}
                title={t(`planner.colorTags.${c}`)}
              />
            ))}
          </div>
        </div>

        <div className="modal-section">
          <label className="modal-label">{t("planner.labelField")}</label>
          <input
            type="text"
            className="label-input"
            value={label}
            readOnly={readOnly}
            maxLength={40}
            placeholder={t("planner.labelPlaceholder")}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>

        <div className="modal-section">
          <label className="modal-label">{t("board.cardModal.description")}</label>
          <textarea
            className="modal-textarea"
            placeholder={t("board.cardModal.descriptionPlaceholder")}
            value={description}
            readOnly={readOnly}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={commitDescription}
          />
        </div>

        <div className="modal-section">
          <div className="subtasks-header">
            <label className="modal-label subtasks-label">{t("planner.subtasks")}</label>
            {checklist.length > 0 && (
              <div className="checklist-progress">
                <div className="checklist-progress-bar">
                  <div className="checklist-progress-fill" style={{ width: pct + "%" }} />
                </div>
                <span>{t("planner.subtasksProgress", { done, total: checklist.length })}</span>
              </div>
            )}
          </div>
          <ul className="checklist">
            {checklist.map((item, idx) => (
              <li key={idx} className={"checklist-item" + (item.done ? " done" : "")}>
                <input type="checkbox" checked={item.done} disabled={readOnly} onChange={() => toggleChecklistItem(idx)} />
                <span>{item.text}</span>
                {!readOnly && (
                  <button type="button" className="checklist-item-remove" onClick={() => removeChecklistItem(idx)}>
                    &times;
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!readOnly && (
            <form className="checklist-add" onSubmit={addChecklistItem}>
              <input
                type="text"
                placeholder={t("planner.addSubtaskPlaceholder")}
                value={checklistText}
                onChange={(e) => setChecklistText(e.target.value)}
              />
              <button type="submit" className="btn-primary btn-small">
                {t("common.add")}
              </button>
            </form>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-primary" onClick={handleSaveAndClose}>
            <CheckMarkIcon /> {t("planner.saveAndClose")}
          </button>
        </div>
      </div>
    </div>
  );
}
