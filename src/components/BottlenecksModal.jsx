import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUsers } from "../state/UsersContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { findBottlenecks, formatDuration, followUpMessage } from "../utils/bottlenecks.js";

export default function BottlenecksModal({ board, onClose }) {
  const { t } = useTranslation();
  const { users } = useUsers();
  const showToast = useToast();
  const [aberto, setAberto] = useState(null);

  // now fixo no render: recalcular a cada tick faria as durações dançarem na tela.
  const gargalos = useMemo(() => findBottlenecks(board, Date.now()), [board]);
  const colunasMonitoradas = board.lists.filter((l) => l.stuckHours);

  async function copiar(item) {
    const texto = followUpMessage(item, t, users);
    try {
      await navigator.clipboard.writeText(texto);
      showToast(t("board.bottlenecks.copied"));
    } catch {
      // clipboard exige contexto seguro; sem ele, abre o texto para copiar à mão
      setAberto(aberto === item.card.id ? null : item.card.id);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal bottleneck-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>
        <div className="modal-header">
          <h2 className="bottleneck-modal-title">{t("board.bottlenecks.title")}</h2>
        </div>

        <div className="modal-body">
          {colunasMonitoradas.length === 0 ? (
            <p className="bottleneck-empty">{t("board.bottlenecks.noneMonitored")}</p>
          ) : gargalos.length === 0 ? (
            <p className="bottleneck-empty bottleneck-clear">
              {t("board.bottlenecks.allClear", { count: colunasMonitoradas.length })}
            </p>
          ) : (
            <>
              <p className="bottleneck-summary">{t("board.bottlenecks.summary", { count: gargalos.length })}</p>
              <ul className="bottleneck-list">
                {gargalos.map((item) => (
                  <li className="bottleneck-item" key={item.card.id}>
                    <div className="bottleneck-item-head">
                      <span className="bottleneck-item-title">{item.card.title}</span>
                      <span className="bottleneck-item-time">{formatDuration(item.hours, t)}</span>
                    </div>
                    <div className="bottleneck-item-meta">
                      {t("board.bottlenecks.inList", {
                        list: item.list.title,
                        limit: item.list.stuckHours,
                      })}
                    </div>
                    <div className="bottleneck-item-actions">
                      <button className="btn-secondary btn-small" onClick={() => copiar(item)}>
                        {t("board.bottlenecks.copyFollowUp")}
                      </button>
                    </div>
                    {aberto === item.card.id && (
                      <textarea
                        className="bottleneck-message"
                        readOnly
                        rows={6}
                        value={followUpMessage(item, t, users)}
                        onFocus={(e) => e.target.select()}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
