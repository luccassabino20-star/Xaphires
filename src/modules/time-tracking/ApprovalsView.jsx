import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";

// "Aprovações" (master): só as semanas com status 'submitted'. Aprovar/
// rejeitar tira a linha da lista na hora (não fica esperando recarregar).
export default function ApprovalsView() {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [pendentes, setPendentes] = useState(null);

  function carregar() {
    api.ttGetApprovals().then(setPendentes).catch((e) => showToast(translateError(e, t)));
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  async function decidir(id, decisao) {
    try {
      if (decisao === "approved") await api.ttApproveTimesheet(id);
      else await api.ttRejectTimesheet(id);
      setPendentes((ps) => ps.filter((p) => p.id !== id));
      showToast(t(decisao === "approved" ? "modules.timeTracking.aprovacoes.aprovado" : "modules.timeTracking.aprovacoes.rejeitado"));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  const formatarData = (iso) => new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso.slice(0, 10) + "T00:00:00"));

  return (
    <div className="tt-approvals-panel">
      <h2 className="tt-section-title">{t("modules.timeTracking.aprovacoes.titulo")}</h2>
      {pendentes === null ? (
        <p className="tt-muted">{t("common.loading")}</p>
      ) : pendentes.length === 0 ? (
        <p className="tt-muted">{t("modules.timeTracking.aprovacoes.vazio")}</p>
      ) : (
        <ul className="tt-approvals-list">
          {pendentes.map((ts) => (
            <li className="tt-approvals-item" key={ts.id}>
              <div>
                <strong>{ts.user_name}</strong>
                <span className="tt-muted"> · {formatarData(ts.start_date)} – {formatarData(ts.end_date)}</span>
              </div>
              <div className="tt-approvals-actions">
                <button type="button" className="btn-primary btn-small" onClick={() => decidir(ts.id, "approved")}>{t("modules.timeTracking.aprovacoes.aprovar")}</button>
                <button type="button" className="btn-ghost btn-small" onClick={() => decidir(ts.id, "rejected")}>{t("modules.timeTracking.aprovacoes.rejeitar")}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
