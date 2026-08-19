import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import PatientDetailModal from "./PatientDetailModal.jsx";

function iniciais(nome) {
  return (nome || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// Log de eventos do agendamento (appointment_logs, append-only - ver o
// comentário do schema). Só a aba "Agendamentos" tem dado por trás hoje;
// "Finanças" fica travada "Em breve" no mesmo padrão do resto do módulo -
// não há eventos financeiros registrados ainda (o pagamento é só um campo
// no próprio agendamento, sem histórico próprio).
export default function AppointmentLogModal({ appointment, patient, onClose }) {
  const { t, i18n } = useTranslation();
  const [logs, setLogs] = useState(null);
  const [erro, setErro] = useState("");
  const [dadosPacienteAberto, setDadosPacienteAberto] = useState(false);

  useEffect(() => {
    api
      .scListAppointmentLogs(appointment.id)
      .then(setLogs)
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, [appointment.id]);

  const dataHora = (data, hora) => `${new Date(data + "T00:00:00").toLocaleDateString(i18n.language)} ${t("saudeClinicas.agenda.as")} ${hora}`;

  if (dadosPacienteAberto) {
    return <PatientDetailModal patientId={patient.id} onClose={onClose} onSaved={() => {}} />;
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sc-log-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
        <div className="sc-log-layout">
          <nav className="sc-log-nav">
            <span className="sc-log-nav-titulo">{t("saudeClinicas.agenda.logsSistema")}</span>
            <button type="button" className="sc-log-nav-item active">{t("saudeClinicas.agenda.logAbaAgendamentos")}</button>
            <button type="button" className="sc-log-nav-item disabled" disabled title={t("modules.comingSoon")}>{t("saudeClinicas.agenda.logAbaFinancas")}</button>
          </nav>

          <div className="sc-log-conteudo">
            <div className="sc-log-topo">
              <div className="sc-log-paciente">
                <span className="sc-detail-avatar sc-log-avatar">{iniciais(patient.name)}</span>
                <div>
                  <span className="sc-detail-paciente-nome">{patient.name}</span>
                  <p className="sc-hint">{dataHora(appointment.date, appointment.time)}</p>
                  <p className="sc-hint">{t("saudeClinicas.agenda.procedimento")}: {logs?.[0]?.procedure_summary || "-"}</p>
                </div>
              </div>
              <button type="button" className="btn-ghost btn-small" onClick={() => setDadosPacienteAberto(true)}>{t("saudeClinicas.agenda.dadosPaciente")} →</button>
            </div>

            {erro && <div className="sc-error">{erro}</div>}

            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>{t("saudeClinicas.agenda.colStatus")}</th>
                    <th>{t("saudeClinicas.agenda.colData")}</th>
                    <th>{t("saudeClinicas.agenda.colConvenio")}</th>
                    <th>{t("saudeClinicas.agenda.procedimento")}</th>
                    <th>{t("saudeClinicas.agenda.modificadoPor")}</th>
                  </tr>
                </thead>
                <tbody>
                  {!logs ? (
                    <tr><td colSpan={5} className="sc-empty">{t("common.loading")}</td></tr>
                  ) : logs.length === 0 ? (
                    <tr><td colSpan={5} className="sc-empty">{t("saudeClinicas.agenda.semLogs")}</td></tr>
                  ) : (
                    logs.map((l) => (
                      <tr key={l.id}>
                        <td><span className={"sc-badge sc-badge-log-" + l.event}>{t(`saudeClinicas.agenda.evento.${l.event}`)}</span></td>
                        <td>{dataHora(l.date, l.time)}</td>
                        <td>{t(`saudeClinicas.agenda.${l.payment_type}`)}</td>
                        <td>{l.procedure_summary || "-"}</td>
                        <td>
                          <strong>{l.modificado_por || "-"}</strong>
                          <br />
                          <span className="sc-hint">{t("saudeClinicas.agenda.alteradoEm")}: {new Date(l.created_at).toLocaleString(i18n.language)}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
