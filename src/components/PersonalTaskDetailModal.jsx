import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
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
// Câmera genérica, não o logo de nenhum provedor - o distintivo de Zoom/Meet/
// Teams é só a cor de fundo do badge (ver .video-quick-btn/.video-join-btn no
// CSS), para não reproduzir marca registrada de terceiros.
function VideoCallIcon({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 3.5v-11z" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11">
      <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" d="M5 5l14 14M19 5 5 19" />
    </svg>
  );
}

// Provedor a partir do domínio do link colado - só decide qual ícone/cor
// mostrar (ver COLORS acima), nunca valida se a URL é "de verdade" de um
// serviço de vídeo. Link fora dos três hosts conhecidos cai em "custom",
// mesmo que a pessoa tenha colado um Zoom com domínio custom de empresa.
function detectVideoProvider(link) {
  try {
    const host = new URL(link).hostname;
    if (host.endsWith("zoom.us")) return "zoom";
    if (host === "meet.google.com") return "meet";
    if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "teams";
  } catch {
    /* link ainda incompleto enquanto a pessoa digita - cai em custom */
  }
  return "custom";
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
  const { user } = useAuth();
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
  const [videoLink, setVideoLink] = useState(task.videoLink || "");
  const [videoProvider, setVideoProvider] = useState(task.videoProvider || null);
  const [generatingZoom, setGeneratingZoom] = useState(false);
  const readOnly = !canUse;
  const personalMeetingLink = user?.prefs?.personalMeetingLink || "";

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
    setVideoLink(task.videoLink || "");
    setVideoProvider(task.videoProvider || null);
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

  // Link colado à mão: valida na saída do campo (não tecla a tecla, mesmo
  // padrão de commitTitle/commitLabel) e deriva o provedor do domínio - a
  // pessoa não escolhe "isto é Zoom" num seletor à parte, o link já diz.
  function commitVideoLink() {
    const trimmed = videoLink.trim();
    if (trimmed === (task.videoLink || "")) return;
    if (trimmed && !/^https:\/\//i.test(trimmed)) {
      showToast(t("errors.VIDEO_LINK_INVALID"));
      setVideoLink(task.videoLink || "");
      return;
    }
    const provider = trimmed ? detectVideoProvider(trimmed) : null;
    setVideoProvider(provider);
    persist({ videoLink: trimmed, videoProvider: provider });
  }

  function clearVideoLink() {
    setVideoLink("");
    setVideoProvider(null);
    persist({ videoLink: "", videoProvider: null });
  }

  // "Solução Rápida" do pedido: usa o link fixo salvo no perfil (Personal
  // Meeting ID do Zoom, ou qualquer outro) em vez de gerar sala nova -
  // desabilitado quando a pessoa ainda não configurou nada lá (ver
  // ProfileHubModal.jsx, aba Preferências).
  function useMyLink() {
    if (!personalMeetingLink) return;
    const provider = user?.prefs?.personalMeetingProvider || "zoom";
    setVideoLink(personalMeetingLink);
    setVideoProvider(provider);
    persist({ videoLink: personalMeetingLink, videoProvider: provider });
  }

  // O Meet não tem API pública para criar sala sem OAuth de usuário (ver
  // server/integrations/zoom.js) - meet.google.com/new cria uma sala de
  // verdade na hora quando a pessoa já está logada no Google, só que o link
  // final não volta pra nós (aba nova, outra origem): a pessoa precisa colar
  // de volta no campo manual, por isso o toast explicando o passo seguinte.
  function createMeet() {
    window.open("https://meet.google.com/new", "_blank", "noopener,noreferrer");
    showToast(t("planner.video.createMeetHint"));
  }

  async function generateZoom() {
    setGeneratingZoom(true);
    try {
      const atualizada = await api.generateZoomLink(task.id);
      setVideoLink(atualizada.videoLink || "");
      setVideoProvider(atualizada.videoProvider || null);
      onChange(atualizada);
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setGeneratingZoom(false);
    }
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

        {type === "event" && (
          <div className="modal-section">
            <label className="modal-label">
              <VideoCallIcon /> {t("planner.video.sectionLabel")}
            </label>
            <div className="video-link-row">
              <input
                type="url"
                className="video-link-input"
                value={videoLink}
                readOnly={readOnly}
                placeholder={t("planner.video.linkPlaceholder")}
                onChange={(e) => setVideoLink(e.target.value)}
                onBlur={commitVideoLink}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
              {videoLink && !readOnly && (
                <button type="button" className="video-link-clear" onClick={clearVideoLink} aria-label={t("planner.video.remove")}>
                  <CloseIcon />
                </button>
              )}
            </div>

            {!readOnly && (
              <div className="video-quick-actions">
                <button
                  type="button"
                  className="video-quick-btn provider-zoom"
                  onClick={useMyLink}
                  disabled={!personalMeetingLink}
                  title={!personalMeetingLink ? t("planner.video.useMyLinkMissing") : undefined}
                >
                  <VideoCallIcon /> {t("planner.video.useMyLink")}
                </button>
                <button type="button" className="video-quick-btn provider-meet" onClick={createMeet}>
                  <VideoCallIcon /> {t("planner.video.createMeet")}
                </button>
                <button type="button" className="video-quick-btn provider-zoom" onClick={generateZoom} disabled={generatingZoom}>
                  <VideoCallIcon /> {generatingZoom ? t("planner.video.generatingZoom") : t("planner.video.generateZoom")}
                </button>
              </div>
            )}

            {videoLink && (
              <a
                className={"video-join-btn provider-" + (videoProvider || "custom")}
                href={videoLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <VideoCallIcon size={15} />
                {videoProvider === "zoom"
                  ? t("planner.video.joinZoom")
                  : videoProvider === "meet"
                  ? t("planner.video.joinMeet")
                  : videoProvider === "teams"
                  ? t("planner.video.joinTeams")
                  : t("planner.video.join")}
              </a>
            )}
          </div>
        )}

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
