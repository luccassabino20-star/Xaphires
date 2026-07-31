import { useTranslation } from "react-i18next";
import { GANTT_STATUS, GANTT_LATE_COLOR } from "./ganttStatus.js";
import { GANTT_ICONS } from "./ganttIcons.jsx";

const STATUS_SWATCHES = { todo: GANTT_STATUS.todo.color, done: GANTT_STATUS.done.color, late: GANTT_LATE_COLOR, agency: GANTT_STATUS.agency.color };

// meta é opcional - quem integra isto num contexto sem "evento/local/data" (ver
// MinutesGanttView) simplesmente não passa a prop, e este bloco some. Mesma
// ideia pra statusKeys/iconKeys: só mostra na legenda o que o dado real usa -
// "agência de publicidade" ou ícone de reunião não fazem sentido pra item de
// ação de ata, por exemplo.
export default function GanttLegend({ meta, statusKeys = ["todo", "done", "late", "agency"], iconKeys = ["meeting", "call", "mail", "check"] }) {
  const { t } = useTranslation();
  return (
    <div className="gnt-footer">
      {meta && (
        <div className="gnt-meta">
          <div className="gnt-meta-row"><span className="gnt-meta-label">{t("gantt.meta.event")}</span> {meta.event}</div>
          <div className="gnt-meta-row"><span className="gnt-meta-label">{t("gantt.meta.venue")}</span> {meta.venue}</div>
          <div className="gnt-meta-row"><span className="gnt-meta-label">{t("gantt.meta.date")}</span> {meta.date}</div>
        </div>
      )}

      <div className="gnt-legend">
        {statusKeys.map((key) => (
          <span key={key} className="gnt-legend-item">
            <span className="gnt-legend-swatch" style={{ background: STATUS_SWATCHES[key] }} />
            {t(`gantt.status.${key}`)}
          </span>
        ))}
        {iconKeys.map((key) => {
          const Icon = GANTT_ICONS[key];
          return (
            <span key={key} className="gnt-legend-item">
              <Icon size={13} />
              {t(`gantt.legend.icons.${key}`)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
