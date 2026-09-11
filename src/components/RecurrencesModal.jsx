import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../state/ToastContext.jsx";
import { useBoardRefetch } from "../state/BoardContext.jsx";
import { translateError } from "../utils/errors.js";
import * as api from "../state/api.js";

const FREQS = ["daily", "weekly", "monthly"];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

// Mesmo molde de ícone do resto do app (viewBox 24x24, stroke fino) - ver
// admin/icons.jsx e ganttIcons.jsx. Sem lib nova só para os 4 traços daqui.
function IconChecklist({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 6 2 2 3-3" />
      <path d="M11 6h9" />
      <path d="m4 13 2 2 3-3" />
      <path d="M11 13h9" />
      <path d="m4 20 2 2 3-3" />
      <path d="M11 20h9" />
    </svg>
  );
}
function IconInfo({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconEdit({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function IconPause({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
function IconPlay({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M7 4v16l14-8Z" />
    </svg>
  );
}
function IconTrash({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-.7 13.1a2 2 0 0 1-2 1.9H8.7a2 2 0 0 1-2-1.9L6 6" />
    </svg>
  );
}

function moldeVazio(listId) {
  return {
    title: "",
    listId: listId || "",
    freq: "monthly",
    weekday: 1,
    weekday2: "",
    monthday: 25,
    monthday2: "",
    hour: 8,
    // "0" por padrão, não vazio: o cartão gerado precisa nascer com vencimento
    // no dia da própria ocorrência (ver dueDateFor em recurrence.js) - deixar
    // em branco por padrão é o que fazia o cartão nascer sem due nenhum, e a
    // prévia da rotina no Calendário nunca reconhecia o cartão de verdade
    // depois de criado (ela casa pelo `due`), duplicando pra sempre.
    dueInDays: "0",
    checklistTexto: "",
  };
}

// Inverso do que salvar() manda para a API: da regra já criada de volta para o
// formato do formulário (checklist vira texto de novo, campos ausentes caem no
// mesmo padrão do molde vazio).
function paraForm(r) {
  return {
    title: r.title,
    listId: r.listId,
    freq: r.freq,
    weekday: r.weekday ?? 1,
    weekday2: r.weekday2 ?? "",
    monthday: r.monthday ?? 25,
    monthday2: r.monthday2 ?? "",
    hour: r.hour,
    // Mesmo default de moldeVazio: uma regra antiga com dueInDays nulo já
    // passou a gerar cartão com vencimento no mesmo dia (dueDateFor trata
    // null como 0) - o formulário mostra "0" para refletir o que realmente
    // vai acontecer, em vez de um campo vazio que sugeriria "sem vencimento".
    dueInDays: r.dueInDays ?? "0",
    checklistTexto: r.checklist.map((c) => c.text).join("\n"),
  };
}

export default function RecurrencesModal({ board, onClose }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const refetchBoards = useBoardRefetch();

  const [regras, setRegras] = useState(null);
  const [podeUsar, setPodeUsar] = useState(false);
  const [erro, setErro] = useState(null);
  const [form, setForm] = useState(moldeVazio(board.lists[0]?.id));
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null); // regra sendo editada, ou null
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      const r = await api.listRecurrences(board.id);
      setRegras(r.recurrences);
      setPodeUsar(r.canUse);
    } catch (e) {
      setErro(translateError(e, t));
      setRegras([]);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function cancelar() {
    setCriando(false);
    setEditando(null);
    setForm(moldeVazio(board.lists[0]?.id));
  }

  function iniciarEdicao(regra) {
    setEditando(regra);
    setCriando(false);
    setForm(paraForm(regra));
  }

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    const dados = {
      title: form.title,
      listId: form.listId,
      freq: form.freq,
      weekday: form.freq === "weekly" ? Number(form.weekday) : null,
      weekday2: form.freq === "weekly" && form.weekday2 !== "" ? Number(form.weekday2) : null,
      monthday: form.freq === "monthly" ? Number(form.monthday) : null,
      monthday2: form.freq === "monthly" && form.monthday2 !== "" ? Number(form.monthday2) : null,
      hour: Number(form.hour),
      dueInDays: form.dueInDays === "" ? null : Number(form.dueInDays),
      // Uma linha por item, que é como se escreve uma rotina de cabeça.
      checklist: form.checklistTexto
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text) => ({ text, done: false })),
    };
    try {
      if (editando) {
        await api.updateRecurrence(editando.id, dados);
        showToast(t("board.recurrences.updated"));
      } else {
        await api.createRecurrence(board.id, dados);
        showToast(t("board.recurrences.created"));
      }
      cancelar();
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(regra) {
    try {
      await api.updateRecurrence(regra.id, { active: !regra.active });
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function remover(regra) {
    if (!confirm(t("board.recurrences.deleteConfirm", { title: regra.title }))) return;
    try {
      await api.deleteRecurrence(regra.id);
      if (editando?.id === regra.id) cancelar();
      await carregar();
      showToast(t("board.recurrences.deleted"));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  function descrever(r) {
    if (r.freq === "daily") return t("board.recurrences.everyDay", { hour: r.hour });
    if (r.freq === "weekly") {
      if (Number.isInteger(r.weekday2)) {
        return t("board.recurrences.everyWeekTwoDays", {
          day: t(`board.recurrences.weekdays.${r.weekday}`),
          day2: t(`board.recurrences.weekdays.${r.weekday2}`),
          hour: r.hour,
        });
      }
      return t("board.recurrences.everyWeek", { day: t(`board.recurrences.weekdays.${r.weekday}`), hour: r.hour });
    }
    if (r.monthday2)
      return t("board.recurrences.everyMonthTwoDays", { day: r.monthday, day2: r.monthday2, hour: r.hour });
    return t("board.recurrences.everyMonth", { day: r.monthday, hour: r.hour });
  }

  const listaNome = (id) => board.lists.find((l) => l.id === id)?.title || t("board.recurrences.listGone");

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal recurrence-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>
        <div className="modal-header">
          <h2 className="recurrence-modal-title">{t("board.recurrences.title")}</h2>
        </div>

        <div className="modal-body">
          {erro && <div className="auth-error">{erro}</div>}
          {!podeUsar && regras !== null && (
            <p className="recurrence-locked">{t("board.recurrences.planRequired")}</p>
          )}

          {regras === null ? (
            <p className="recurrence-empty">{t("common.loading")}</p>
          ) : regras.length === 0 ? (
            <p className="recurrence-empty">{t("board.recurrences.empty")}</p>
          ) : (
            <ul className="recurrence-list">
              {regras.map((r) => (
                <li className={"recurrence-card" + (r.active ? "" : " inactive")} key={r.id}>
                  <div className="recurrence-card-info">
                    <div className="recurrence-card-heading">
                      <span className="recurrence-card-title">{r.title}</span>
                      <span className={"recurrence-status-pill" + (r.active ? " active" : " paused")}>
                        {r.active ? t("board.recurrences.statusActive") : t("board.recurrences.statusPaused")}
                      </span>
                    </div>
                    <span className="recurrence-item-meta">
                      {descrever(r)} · {t("board.recurrences.intoList", { list: listaNome(r.listId) })}
                      {r.checklist.length > 0 &&
                        ` · ${t("board.recurrences.checklistCount", { count: r.checklist.length })}`}
                    </span>
                    {r.lastRunAt && (
                      <span className="recurrence-item-last">
                        {t("board.recurrences.lastRun", { date: new Date(r.lastRunAt).toLocaleDateString() })}
                      </span>
                    )}
                  </div>
                  <div className="recurrence-card-actions">
                    <button
                      type="button"
                      className="recurrence-action-btn"
                      onClick={() => iniciarEdicao(r)}
                      disabled={!podeUsar}
                    >
                      <IconEdit /> {t("board.recurrences.edit")}
                    </button>
                    <button type="button" className="recurrence-action-btn" onClick={() => alternar(r)} disabled={!podeUsar}>
                      {r.active ? <IconPause /> : <IconPlay />} {r.active ? t("board.recurrences.pause") : t("board.recurrences.resume")}
                    </button>
                    <button type="button" className="recurrence-action-btn danger" onClick={() => remover(r)}>
                      <IconTrash /> {t("board.recurrences.delete")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {podeUsar && !criando && !editando && (
            <button className="btn-primary recurrence-new" onClick={() => setCriando(true)}>
              {t("board.recurrences.newRule")}
            </button>
          )}

          {podeUsar && (criando || editando) && (
            <form className="recurrence-form" onSubmit={salvar}>
              {editando && <p className="recurrence-hint recurrence-editing-hint">{t("board.recurrences.editingHint", { title: editando.title })}</p>}
              <label className="recurrence-field recurrence-field-title">
                <span>{t("board.recurrences.fieldTitle")}</span>
                <input
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder={t("board.recurrences.titlePlaceholder")}
                  required
                  autoFocus
                />
              </label>

              <div className="recurrence-grid">
                <label className="recurrence-field">
                  <span>{t("board.recurrences.fieldList")}</span>
                  <span className="recurrence-select-wrap">
                    <select value={form.listId} onChange={(e) => set("listId", e.target.value)} required>
                      {board.lists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.title}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>

                <label className="recurrence-field">
                  <span>{t("board.recurrences.fieldFreq")}</span>
                  <span className="recurrence-select-wrap">
                    <select value={form.freq} onChange={(e) => set("freq", e.target.value)}>
                      {FREQS.map((f) => (
                        <option key={f} value={f}>
                          {t(`board.recurrences.freq.${f}`)}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>

                {form.freq === "weekly" && (
                  <label className="recurrence-field">
                    <span>{t("board.recurrences.fieldWeekday")}</span>
                    <span className="recurrence-select-wrap">
                      <select value={form.weekday} onChange={(e) => set("weekday", e.target.value)}>
                        {WEEKDAYS.map((d) => (
                          <option key={d} value={d}>
                            {t(`board.recurrences.weekdays.${d}`)}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                )}
                {form.freq === "weekly" && (
                  <label className="recurrence-field">
                    <span>{t("board.recurrences.fieldWeekday2")}</span>
                    <span className="recurrence-select-wrap">
                      <select value={form.weekday2} onChange={(e) => set("weekday2", e.target.value)}>
                        <option value="">{t("board.recurrences.noSecondDay")}</option>
                        {WEEKDAYS.map((d) => (
                          <option key={d} value={d}>
                            {t(`board.recurrences.weekdays.${d}`)}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                )}
                {form.freq === "monthly" && (
                  <label className="recurrence-field">
                    <span>{t("board.recurrences.fieldMonthday")}</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={form.monthday}
                      onChange={(e) => set("monthday", e.target.value)}
                    />
                  </label>
                )}
                {form.freq === "monthly" && (
                  <label className="recurrence-field">
                    <span>{t("board.recurrences.fieldMonthday2")}</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder={t("board.recurrences.noSecondDay")}
                      value={form.monthday2}
                      onChange={(e) => set("monthday2", e.target.value)}
                    />
                  </label>
                )}
                <label className="recurrence-field">
                  <span>{t("board.recurrences.fieldHour")}</span>
                  <input type="number" min="0" max="23" value={form.hour} onChange={(e) => set("hour", e.target.value)} />
                </label>
                <label className="recurrence-field">
                  <span>{t("board.recurrences.fieldDueInDays")}</span>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={form.dueInDays}
                    onChange={(e) => set("dueInDays", e.target.value)}
                    placeholder={t("board.recurrences.noDue")}
                  />
                  <span className="recurrence-field-hint">{t("board.recurrences.dueInDaysHint")}</span>
                </label>
              </div>

              <label className="recurrence-field">
                <span className="recurrence-checklist-label">
                  <IconChecklist /> {t("board.recurrences.fieldChecklist")}
                </span>
                <textarea
                  rows={4}
                  value={form.checklistTexto}
                  onChange={(e) => set("checklistTexto", e.target.value)}
                  placeholder={t("board.recurrences.checklistPlaceholder")}
                />
                <span className="recurrence-field-hint">{t("board.recurrences.checklistSyntaxHint")}</span>
              </label>

              {form.freq === "monthly" && (Number(form.monthday) > 28 || Number(form.monthday2) > 28) && (
                <p className="recurrence-warning">{t("board.recurrences.monthdayWarning")}</p>
              )}

              <div className="recurrence-form-footer">
                <button type="button" className="recurrence-btn-ghost" onClick={cancelar}>
                  {t("common.cancel")}
                </button>
                <button type="submit" className="recurrence-btn-primary" disabled={salvando}>
                  {editando ? t("board.recurrences.saveEdit") : t("board.recurrences.save")}
                </button>
              </div>
            </form>
          )}

          <p className="recurrence-hint recurrence-info-banner">
            <IconInfo /> {t("board.recurrences.hint")}
          </p>
        </div>
      </div>
    </div>
  );
}
