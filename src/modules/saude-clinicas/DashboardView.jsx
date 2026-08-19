import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";

// Visão geral: só mostra números que o módulo já tem de verdade (pacientes,
// fichas de anamnese por status). Faturamento e indicadores de atendimento
// dependem de Agenda e Financeiro da clínica, que ainda são "Em breve" - por
// isso entram como cartão de aviso, não como um KPI fabricado (zero
// enganaria: pareceria que a clínica não faturou nada, e não que o recurso
// simplesmente não existe ainda).
export default function DashboardView() {
  const { t } = useTranslation();
  const [patients, setPatients] = useState(null);
  const [respostas, setRespostas] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    Promise.all([api.scListPatients(), api.scListAnamneseResponses()])
      .then(([p, r]) => {
        setPatients(p);
        setRespostas(r);
      })
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, []);

  if (erro) return <div className="sc-error">{erro}</div>;
  if (!patients || !respostas) return <p className="sc-hint">{t("common.loading")}</p>;

  const ativos = patients.filter((p) => p.active).length;
  const enviadas = respostas.filter((r) => r.status === "enviado").length;
  const respondidas = respostas.filter((r) => r.status === "respondido").length;

  return (
    <div className="sc-cad-secao">
      <div className="fin-kpis">
        <div className="fin-kpi">
          <span className="fin-kpi-label">{t("saudeClinicas.dashboard.pacientesAtivos")}</span>
          <span className="fin-kpi-value">{ativos}</span>
        </div>
        <div className="fin-kpi">
          <span className="fin-kpi-label">{t("saudeClinicas.dashboard.fichasEnviadas")}</span>
          <span className="fin-kpi-value">{enviadas}</span>
        </div>
        <div className="fin-kpi">
          <span className="fin-kpi-label">{t("saudeClinicas.dashboard.fichasRespondidas")}</span>
          <span className="fin-kpi-value">{respondidas}</span>
        </div>
      </div>
      <div className="sc-placeholder-pane">
        <p>{t("saudeClinicas.dashboard.avisoIndicadores")}</p>
      </div>
    </div>
  );
}
