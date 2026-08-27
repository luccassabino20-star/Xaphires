import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import { parseDuration, formatDuration } from "../../utils/parseDuration.js";
import * as api from "../../state/api.js";

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDataCivil(s) {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d);
}
function paraCivil(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const META_DIARIA_MINUTOS = 8 * 60;

function formatarCronometro(segundos) {
  const h = String(Math.floor(segundos / 3600)).padStart(2, "0");
  const m = String(Math.floor((segundos % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(segundos % 60)).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
// "09:40" -> "9:40 am" (mesma leitura da referência de imagem) - Intl não
// formata string de hora solta, só Date, daí o Date fake de hoje só pra isso.
function formatarHoraCurta(horaISO, lang) {
  if (!horaISO) return "";
  const [h, m] = horaISO.slice(11, 16).split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m), 0, 0);
  return new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit" }).format(d);
}

// Aba "Meus Apontamentos": grade semanal ocupa o centro/esquerda (maior
// espaço); o painel "Track Time" é a barra lateral à DIREITA - pedido
// explícito do cliente (inversão do layout anterior, onde o painel vinha
// primeiro). "Todos os apontamentos"/"Aprovações" (master) vivem em
// componentes irmãos.
export default function MyTimesheetView() {
  const { t, i18n } = useTranslation();
  const showToast = useToast();

  const [tasks, setTasks] = useState([]);
  const [running, setRunning] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [todayEntries, setTodayEntries] = useState([]);
  const [weekAnchor, setWeekAnchor] = useState(hojeCivil());
  const [weekly, setWeekly] = useState(null);

  const [taskId, setTaskId] = useState("");
  const [descricao, setDescricao] = useState(""); // input único: notas ao rodar cronômetro, ou duração rápida ("1h 30m") ao lançar direto
  const [dataManual, setDataManual] = useState(hojeCivil());
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [tags, setTags] = useState([]);
  const [novaTag, setNovaTag] = useState("");
  const [billable, setBillable] = useState(true);
  const [novaTarefa, setNovaTarefa] = useState("");
  const [novoProjeto, setNovoProjeto] = useState("");
  const [mostrarNovaTarefa, setMostrarNovaTarefa] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [celulaEditando, setCelulaEditando] = useState(null); // { taskId, date }
  const [valorCelula, setValorCelula] = useState("");

  async function carregarTudo() {
    const [ts, rn, hoje] = await Promise.all([api.ttGetTasks(), api.ttGetRunningEntry(), api.ttGetTodayEntries()]);
    setTasks(ts);
    setRunning(rn);
    setTodayEntries(hoje);
  }
  useEffect(() => {
    carregarTudo().catch((e) => showToast(translateError(e, t)));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    api.ttGetWeekly(weekAnchor).then(setWeekly).catch((e) => showToast(translateError(e, t)));
    // eslint-disable-next-line
  }, [weekAnchor]);

  // Cronômetro visual: recalcula do zero a cada segundo a partir do
  // start_time real (não incrementa um contador local) - se a aba ficar
  // minimizada e voltar, o relógio continua certo.
  useEffect(() => {
    if (!running) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(running.startTime).getTime()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running]);

  function limparFormulario() {
    setDescricao("");
    setHoraInicio("");
    setHoraFim("");
    setTags([]);
  }

  async function iniciarCronometro() {
    setSalvando(true);
    try {
      const entrada = await api.ttStartTimer({ taskId: taskId || null, notes: descricao, tags, billable });
      setRunning(entrada);
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }
  async function pararCronometro() {
    if (!running) return;
    setSalvando(true);
    try {
      await api.ttStopTimer(running.id);
      setRunning(null);
      setElapsed(0);
      limparFormulario();
      await Promise.all([api.ttGetTodayEntries().then(setTodayEntries), api.ttGetWeekly(weekAnchor).then(setWeekly)]);
      showToast(t("modules.timeTracking.tracker.parado"));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  // Um input só: se houver início/fim preenchidos, manda o intervalo exato
  // (o servidor calcula a duração); senão tenta ler a descrição como duração
  // rápida ("1h 30m") - só quando o texto INTEIRO é uma duração é que ele
  // conta como lançamento (não sobra como nota, porque não sobrou descrição
  // nenhuma pra guardar). Texto que não é duração pura vira nota do
  // cronômetro (botão de play), não um lançamento.
  async function enviarEntradaRapida(e) {
    e.preventDefault();
    const intervalo = horaInicio && horaFim;
    const minutos = intervalo ? null : parseDuration(descricao);
    if (!intervalo && !minutos) {
      showToast(t("modules.timeTracking.tracker.duracaoInvalida"));
      return;
    }
    setSalvando(true);
    try {
      await api.ttCreateEntry({
        taskId: taskId || null,
        date: dataManual,
        durationMinutes: intervalo ? undefined : minutos,
        startTime: intervalo ? horaInicio : undefined,
        endTime: intervalo ? horaFim : undefined,
        notes: "",
        tags,
        billable,
      });
      limparFormulario();
      await Promise.all([api.ttGetTodayEntries().then(setTodayEntries), api.ttGetWeekly(weekAnchor).then(setWeekly)]);
      showToast(t("modules.timeTracking.tracker.lancado"));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  function adicionarTag(e) {
    if (e.key !== "Enter" || !novaTag.trim()) return;
    e.preventDefault();
    if (!tags.includes(novaTag.trim())) setTags((ts) => [...ts, novaTag.trim()]);
    setNovaTag("");
  }
  function removerTag(tag) {
    setTags((ts) => ts.filter((x) => x !== tag));
  }

  async function criarTarefa(e) {
    e.preventDefault();
    if (!novaTarefa.trim()) return;
    try {
      const tarefa = await api.ttCreateTask({ name: novaTarefa.trim(), projectName: novoProjeto.trim() });
      setTasks((ts) => [...ts, tarefa]);
      setTaskId(tarefa.id);
      setNovaTarefa("");
      setNovoProjeto("");
      setMostrarNovaTarefa(false);
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function excluirEntrada(id) {
    try {
      await api.ttDeleteEntry(id);
      setTodayEntries((es) => es.filter((e) => e.id !== id));
      api.ttGetWeekly(weekAnchor).then(setWeekly);
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function salvarCelula(alvoTaskId, alvoDate) {
    const minutos = parseDuration(valorCelula);
    setCelulaEditando(null);
    if (!minutos) return;
    try {
      await api.ttCreateEntry({ taskId: alvoTaskId, date: alvoDate, durationMinutes: minutos, notes: "", tags: [], billable: true });
      const atualizado = await api.ttGetWeekly(weekAnchor);
      setWeekly(atualizado);
      if (alvoDate === hojeCivil()) api.ttGetTodayEntries().then(setTodayEntries);
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function submeterSemana() {
    if (!weekly?.timesheet) return;
    try {
      await api.ttSubmitTimesheet(weekly.timesheet.id);
      const atualizado = await api.ttGetWeekly(weekAnchor);
      setWeekly(atualizado);
      showToast(t("modules.timeTracking.grade.semanaEnviada"));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  // Matriz tarefa x dia, somando minutos por par - várias entradas no mesmo
  // dia/tarefa (cronômetro + manual, por exemplo) se acumulam numa célula só.
  const { dias, matriz, totalPorDia, tarefasComLancamento } = useMemo(() => {
    const inicio = parseDataCivil(weekAnchor);
    const diaSemana = inicio.getDay();
    inicio.setDate(inicio.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
    const dias = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(d.getDate() + i);
      return paraCivil(d);
    });
    const matriz = {};
    const totalPorDia = Object.fromEntries(dias.map((d) => [d, 0]));
    const idsComLancamento = new Set();
    for (const entrada of weekly?.entries || []) {
      const chave = `${entrada.taskId}__${entrada.date}`;
      matriz[chave] = (matriz[chave] || 0) + entrada.durationMinutes;
      totalPorDia[entrada.date] = (totalPorDia[entrada.date] || 0) + entrada.durationMinutes;
      if (entrada.taskId) idsComLancamento.add(entrada.taskId);
    }
    const tarefasComLancamento = tasks.filter((tk) => idsComLancamento.has(tk.id));
    return { dias, matriz, totalPorDia, tarefasComLancamento };
  }, [weekly, weekAnchor, tasks]);

  const rotuloDia = (iso) => new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "2-digit", month: "2-digit" }).format(parseDataCivil(iso));
  const rotuloDiaCompleto = (iso) => new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "long" }).format(parseDataCivil(iso));
  const statusSemana = weekly?.timesheet?.status || "draft";

  return (
    <div className="tt-content">
      <section className="tt-grid-panel">
        <div className="tt-grid-toolbar">
          <button type="button" className="btn-ghost btn-small" onClick={() => setWeekAnchor(paraCivil(new Date(parseDataCivil(weekAnchor).setDate(parseDataCivil(weekAnchor).getDate() - 7))))}>‹</button>
          <span className="tt-grid-week-label">{weekly ? `${rotuloDia(weekly.startDate)} – ${rotuloDia(weekly.endDate)}` : "…"}</span>
          <button type="button" className="btn-ghost btn-small" onClick={() => setWeekAnchor(paraCivil(new Date(parseDataCivil(weekAnchor).setDate(parseDataCivil(weekAnchor).getDate() + 7))))}>›</button>
          <span className={"tt-status-badge tt-status-" + statusSemana}>{t(`modules.timeTracking.grade.status.${statusSemana}`)}</span>
          {(statusSemana === "draft" || statusSemana === "rejected") && (
            <button type="button" className="btn-primary btn-small" style={{ marginLeft: "auto" }} onClick={submeterSemana}>
              {t("modules.timeTracking.grade.enviarSemana")}
            </button>
          )}
        </div>

        <div className="tt-grid-scroll">
          <table className="tt-grid-table">
            <thead>
              <tr>
                <th className="tt-grid-task-col">{t("modules.timeTracking.grade.tarefa")}</th>
                {dias.map((dia) => {
                  const total = totalPorDia[dia] || 0;
                  const pct = Math.min(100, Math.round((total / META_DIARIA_MINUTOS) * 100));
                  return (
                    <th key={dia} className={"tt-grid-day-col" + (dia === hojeCivil() ? " today" : "")}>
                      <span className="tt-grid-day-label">{rotuloDia(dia)}</span>
                      <span className="tt-grid-day-total">{formatDuration(total) || "—"}</span>
                      <span className="tt-grid-day-bar"><span className="tt-grid-day-bar-fill" style={{ width: `${pct}%` }} /></span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tarefasComLancamento.length === 0 ? (
                <tr><td colSpan={8} className="tt-muted" style={{ padding: "18px 4px" }}>{t("modules.timeTracking.grade.semLancamentos")}</td></tr>
              ) : (
                tarefasComLancamento.map((tarefa) => (
                  <tr key={tarefa.id}>
                    <td className="tt-grid-task-col">
                      <strong>{tarefa.name}</strong>
                      {tarefa.project_name && <span className="tt-muted"> · {tarefa.project_name}</span>}
                    </td>
                    {dias.map((dia) => {
                      const minutos = matriz[`${tarefa.id}__${dia}`] || 0;
                      const editando = celulaEditando?.taskId === tarefa.id && celulaEditando?.date === dia;
                      return (
                        <td key={dia} className={"tt-grid-cell" + (dia === hojeCivil() ? " today" : "")}>
                          {editando ? (
                            <input
                              type="text"
                              autoFocus
                              className="tt-grid-cell-input"
                              value={valorCelula}
                              onChange={(e) => setValorCelula(e.target.value)}
                              onBlur={() => salvarCelula(tarefa.id, dia)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") salvarCelula(tarefa.id, dia);
                                if (e.key === "Escape") setCelulaEditando(null);
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className="tt-grid-cell-btn"
                              onClick={() => { setCelulaEditando({ taskId: tarefa.id, date: dia }); setValorCelula(""); }}
                            >
                              {formatDuration(minutos) || "—"}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="tt-tracker">
        <h2 className="tt-tracker-title">{t("modules.timeTracking.tracker.trackTime")}</h2>

        <form className="tt-quick-row" onSubmit={enviarEntradaRapida}>
          <input
            type="text"
            className="tt-quick-input"
            placeholder={t("modules.timeTracking.tracker.novoApontamento")}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            disabled={!!running}
          />
          {!running && (parseDuration(descricao) || (horaInicio && horaFim)) && (
            <button type="submit" className="tt-quick-confirm" title={t("modules.timeTracking.tracker.lancar")} disabled={salvando}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L19 7" /></svg>
            </button>
          )}
          <button
            type="button"
            className={"tt-tracker-play" + (running ? " running" : "")}
            onClick={running ? pararCronometro : iniciarCronometro}
            disabled={salvando}
          >
            {running ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
        </form>
        {running && <div className="tt-tracker-clock">{formatarCronometro(elapsed)}</div>}

        <label className="tt-tracker-field">
          <span>{t("modules.timeTracking.tracker.tarefa")}</span>
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!!running}>
            <option value="">{t("modules.timeTracking.tracker.semTarefa")}</option>
            {tasks.map((tk) => (
              <option key={tk.id} value={tk.id}>{tk.project_name ? `${tk.project_name} · ${tk.name}` : tk.name}</option>
            ))}
          </select>
        </label>
        {!mostrarNovaTarefa ? (
          <button type="button" className="tt-link-btn" onClick={() => setMostrarNovaTarefa(true)}>{t("modules.timeTracking.tracker.novaTarefa")}</button>
        ) : (
          <form className="tt-inline-form" onSubmit={criarTarefa}>
            <input type="text" placeholder={t("modules.timeTracking.tracker.nomeTarefa")} value={novaTarefa} onChange={(e) => setNovaTarefa(e.target.value)} autoFocus />
            <input type="text" placeholder={t("modules.timeTracking.tracker.nomeProjeto")} value={novoProjeto} onChange={(e) => setNovoProjeto(e.target.value)} />
            <div className="tt-inline-form-actions">
              <button type="submit" className="btn-primary btn-small">{t("common.add")}</button>
              <button type="button" className="btn-ghost btn-small" onClick={() => setMostrarNovaTarefa(false)}>{t("common.cancel")}</button>
            </div>
          </form>
        )}

        <div className="tt-datetime-row">
          <label className="tt-tracker-field">
            <span>{t("modules.timeTracking.tracker.data")}</span>
            <input type="date" value={dataManual} onChange={(e) => setDataManual(e.target.value)} disabled={!!running} />
          </label>
          <label className="tt-tracker-field">
            <span>{t("modules.timeTracking.tracker.inicio")}</span>
            <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} disabled={!!running} />
          </label>
          <label className="tt-tracker-field">
            <span>{t("modules.timeTracking.tracker.fim")}</span>
            <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} disabled={!!running} />
          </label>
        </div>

        <label className="tt-tracker-field">
          <span>{t("modules.timeTracking.tracker.tags")}</span>
          <div className="tt-tags-input">
            {tags.map((tag) => (
              <span className="tt-tag-chip" key={tag}>
                {tag}
                <button type="button" onClick={() => removerTag(tag)} aria-label={t("common.remove")}>&times;</button>
              </span>
            ))}
            <input
              type="text"
              value={novaTag}
              onChange={(e) => setNovaTag(e.target.value)}
              onKeyDown={adicionarTag}
              placeholder={tags.length === 0 ? t("modules.timeTracking.tracker.addTags") : ""}
              disabled={!!running}
            />
          </div>
        </label>

        <div className="tt-switch-row">
          <span>{t("modules.timeTracking.tracker.billable")}</span>
          <button type="button" className={"tt-switch" + (billable ? " on" : "")} onClick={() => setBillable((b) => !b)} disabled={!!running} role="switch" aria-checked={billable}>
            <span className="tt-switch-knob" />
          </button>
        </div>

        <h3 className="tt-section-title">{t("modules.timeTracking.tracker.hojeData", { data: rotuloDiaCompleto(hojeCivil()) })}</h3>
        {todayEntries.length === 0 ? (
          <p className="tt-muted">{t("modules.timeTracking.tracker.semLancamentosHoje")}</p>
        ) : (
          <ul className="tt-today-list">
            {todayEntries.map((entrada) => (
              <li className="tt-today-item" key={entrada.id}>
                <div className="tt-today-info">
                  <span className="tt-today-task">{entrada.taskName || t("modules.timeTracking.tracker.semTarefa")}</span>
                  {entrada.startTime && (
                    <span className="tt-today-range">
                      {formatarHoraCurta(entrada.startTime, i18n.language)} – {entrada.endTime ? formatarHoraCurta(entrada.endTime, i18n.language) : t("modules.timeTracking.tracker.emAndamento")}
                    </span>
                  )}
                </div>
                <span className="tt-today-duration">
                  {entrada.startTime && !entrada.endTime ? t("modules.timeTracking.tracker.emAndamento") : formatDuration(entrada.durationMinutes)}
                </span>
                <button type="button" className="tt-today-remove" onClick={() => excluirEntrada(entrada.id)} aria-label={t("common.remove")}>&times;</button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
