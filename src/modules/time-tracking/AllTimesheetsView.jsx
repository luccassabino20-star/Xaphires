import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import { formatDuration } from "../../utils/parseDuration.js";
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

// "Todos os apontamentos" (master): mesma semana, mas somada por PESSOA em
// vez de por tarefa - é a visão gerencial ("quanto cada um apontou"), não a
// grade de edição individual (essa é só em MyTimesheetView.jsx).
export default function AllTimesheetsView() {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [weekAnchor, setWeekAnchor] = useState(hojeCivil());
  const [dados, setDados] = useState(null);

  useEffect(() => {
    api.ttGetAllWeekly(weekAnchor).then(setDados).catch((e) => showToast(translateError(e, t)));
    // eslint-disable-next-line
  }, [weekAnchor]);

  const rotuloDia = (iso) => new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "2-digit", month: "2-digit" }).format(parseDataCivil(iso));

  const { dias, porUsuario } = useMemo(() => {
    const inicio = dados ? parseDataCivil(dados.startDate) : parseDataCivil(weekAnchor);
    const dias = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(d.getDate() + i);
      return paraCivil(d);
    });
    const porUsuario = new Map();
    for (const entrada of dados?.entries || []) {
      if (!porUsuario.has(entrada.userId)) porUsuario.set(entrada.userId, { nome: entrada.userName, porDia: Object.fromEntries(dias.map((d) => [d, 0])), total: 0 });
      const linha = porUsuario.get(entrada.userId);
      linha.porDia[entrada.date] = (linha.porDia[entrada.date] || 0) + entrada.durationMinutes;
      linha.total += entrada.durationMinutes;
    }
    return { dias, porUsuario: [...porUsuario.values()].sort((a, b) => b.total - a.total) };
  }, [dados, weekAnchor]);

  return (
    <div className="tt-all-panel">
      <div className="tt-grid-toolbar">
        <button type="button" className="btn-ghost btn-small" onClick={() => setWeekAnchor(paraCivil(new Date(parseDataCivil(weekAnchor).setDate(parseDataCivil(weekAnchor).getDate() - 7))))}>‹</button>
        <span className="tt-grid-week-label">{dados ? `${rotuloDia(dados.startDate)} – ${rotuloDia(dados.endDate)}` : "…"}</span>
        <button type="button" className="btn-ghost btn-small" onClick={() => setWeekAnchor(paraCivil(new Date(parseDataCivil(weekAnchor).setDate(parseDataCivil(weekAnchor).getDate() + 7))))}>›</button>
      </div>

      <div className="tt-grid-scroll">
        <table className="tt-grid-table">
          <thead>
            <tr>
              <th className="tt-grid-task-col">{t("modules.timeTracking.grade.pessoa")}</th>
              {dias.map((dia) => (
                <th key={dia} className={"tt-grid-day-col" + (dia === hojeCivil() ? " today" : "")}>
                  <span className="tt-grid-day-label">{rotuloDia(dia)}</span>
                </th>
              ))}
              <th className="tt-grid-day-col">{t("modules.timeTracking.grade.total")}</th>
            </tr>
          </thead>
          <tbody>
            {porUsuario.length === 0 ? (
              <tr><td colSpan={9} className="tt-muted" style={{ padding: "18px 4px" }}>{t("modules.timeTracking.grade.semLancamentos")}</td></tr>
            ) : (
              porUsuario.map((linha) => (
                <tr key={linha.nome}>
                  <td className="tt-grid-task-col"><strong>{linha.nome}</strong></td>
                  {dias.map((dia) => (
                    <td key={dia} className={"tt-grid-cell" + (dia === hojeCivil() ? " today" : "")}>{formatDuration(linha.porDia[dia]) || "—"}</td>
                  ))}
                  <td className="tt-grid-cell"><strong>{formatDuration(linha.total) || "—"}</strong></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
