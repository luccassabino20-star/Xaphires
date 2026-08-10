import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../state/ToastContext.jsx";
import { useBoardRefetch } from "../state/BoardContext.jsx";
import { translateError } from "../utils/errors.js";
import * as api from "../state/api.js";

const FREQS = ["daily", "weekly", "monthly"];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function moldeVazio(listId) {
  return {
    title: "",
    listId: listId || "",
    freq: "monthly",
    weekday: 1,
    monthday: 25,
    monthday2: "",
    hour: 8,
    dueInDays: "",
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
    monthday: r.monthday ?? 25,
    monthday2: r.monthday2 ?? "",
    hour: r.hour,
    dueInDays: r.dueInDays ?? "",
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
    if (r.freq === "weekly")
      return t("board.recurrences.everyWeek", { day: t(`board.recurrences.weekdays.${r.weekday}`), hour: r.hour });
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
                <li className={"recurrence-item" + (r.active ? "" : " inactive")} key={r.id}>
                  <div className="recurrence-item-info">
                    <span className="recurrence-item-title">{r.title}</span>
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
                  <div className="recurrence-item-actions">
                    <button
                      className="btn-secondary btn-small"
                      onClick={() => iniciarEdicao(r)}
                      disabled={!podeUsar}
                    >
                      {t("board.recurrences.edit")}
                    </button>
                    <button className="btn-secondary btn-small" onClick={() => alternar(r)} disabled={!podeUsar}>
                      {r.active ? t("board.recurrences.pause") : t("board.recurrences.resume")}
                    </button>
                    <button className="btn-danger btn-small" onClick={() => remover(r)}>
                      {t("board.recurrences.delete")}
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
              {editando && <p className="recurrence-hint">{t("board.recurrences.editingHint", { title: editando.title })}</p>}
              <label className="recurrence-field">
                <span>{t("board.recurrences.fieldTitle")}</span>
                <input
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder={t("board.recurrences.titlePlaceholder")}
                  required
                  autoFocus
                />
              </label>

              <div className="recurrence-row">
                <label className="recurrence-field">
                  <span>{t("board.recurrences.fieldList")}</span>
                  <select value={form.listId} onChange={(e) => set("listId", e.target.value)} required>
                    {board.lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="recurrence-field">
                  <span>{t("board.recurrences.fieldFreq")}</span>
                  <select value={form.freq} onChange={(e) => set("freq", e.target.value)}>
                    {FREQS.map((f) => (
                      <option key={f} value={f}>
                        {t(`board.recurrences.freq.${f}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="recurrence-row">
                {form.freq === "weekly" && (
                  <label className="recurrence-field">
                    <span>{t("board.recurrences.fieldWeekday")}</span>
                    <select value={form.weekday} onChange={(e) => set("weekday", e.target.value)}>
                      {WEEKDAYS.map((d) => (
                        <option key={d} value={d}>
                          {t(`board.recurrences.weekdays.${d}`)}
                        </option>
                      ))}
                    </select>
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
                </label>
              </div>

              <label className="recurrence-field">
                <span>{t("board.recurrences.fieldChecklist")}</span>
                <textarea
                  rows={4}
                  value={form.checklistTexto}
                  onChange={(e) => set("checklistTexto", e.target.value)}
                  placeholder={t("board.recurrences.checklistPlaceholder")}
                />
              </label>

              {form.freq === "monthly" && (Number(form.monthday) > 28 || Number(form.monthday2) > 28) && (
                <p className="recurrence-warning">{t("board.recurrences.monthdayWarning")}</p>
              )}

              <div className="recurrence-form-actions">
                <button type="submit" className="btn-primary btn-small" disabled={salvando}>
                  {editando ? t("board.recurrences.saveEdit") : t("board.recurrences.save")}
                </button>
                <button type="button" className="btn-cancel" onClick={cancelar}>
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          )}

          <p className="recurrence-hint">{t("board.recurrences.hint")}</p>
        </div>
      </div>
    </div>
  );
}
