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
  const readOnly = !canUse;

  // Troca de tarefa (o usuário fechou e abriu outra) - sem isso os campos
  // ficariam com o conteúdo da tarefa anterior até o próximo re-render.
  useEffect(() => {
    setTitle(task.title);
    setDue(task.due);
    setDescription(task.description || "");
    setChecklist(task.checklist || []);
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

        <div className="modal-header">
          <input
            className="modal-title-input"
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
