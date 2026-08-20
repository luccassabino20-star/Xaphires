import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents } from "../financeiro/dinheiro.js";
import { whatsappLink } from "../../utils/contact.js";
import AppointmentLogModal from "./AppointmentLogModal.jsx";
import { calcularIdade, minutosDesde, minutosParaHora, paraMinutos } from "./agendaUtils.js";

const STATUS_VALIDOS = ["agendado", "confirmado", "em_atendimento", "concluido", "cancelado", "faltou"];

function iniciais(nome) {
  return (nome || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function parseProcedures(json) {
  try {
    const arr = typeof json === "string" ? JSON.parse(json) : json;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// "há X minutos/horas/dias" a partir de minutos decorridos - texto curto o
// bastante para caber ao lado de "Última consulta:" sem quebrar linha.
function tempoRelativo(min, t) {
  if (min < 60) return t("saudeClinicas.agenda.haMinutos", { count: Math.max(1, min) });
  if (min < 60 * 24) return t("saudeClinicas.agenda.haHoras", { count: Math.round(min / 60) });
  return t("saudeClinicas.agenda.haDias", { count: Math.round(min / (60 * 24)) });
}

// Detalhe do agendamento: some do resumo enxuto do card pra dados completos
// do paciente + ações (lembrete por WhatsApp, cobrança simples, editar,
// cancelar, mudar status). onEditar delega a edição de verdade para o
// AppointmentModal (AgendaView troca este modal pelo outro); aqui só se lê e
// se aciona atalhos rápidos.
export default function AppointmentDetailModal({ appointment, patient, onClose, onChanged, onEditar }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [historico, setHistorico] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [logAberto, setLogAberto] = useState(false);

  useEffect(() => {
    api
      .scListPatientAppointments(patient.id)
      .then(setHistorico)
      .catch(() => setHistorico([]));
  }, [patient.id]);

  // historico já vem do servidor ordenado do mais recente pro mais antigo
  // (ver listAppointmentsByPatient) - o primeiro que for anterior a este
  // agendamento já é o mais recente entre os anteriores, sem precisar
  // reordenar nem comparar tudo.
  const ultimaConsulta = useMemo(() => {
    if (!historico) return null;
    return (
      historico.find(
        (h) => h.id !== appointment.id && h.status !== "cancelado" && (h.date < appointment.date || (h.date === appointment.date && h.time < appointment.time))
      ) || null
    );
  }, [historico, appointment]);

  const idade = calcularIdade(patient.birth_date);
  const procedures = parseProcedures(appointment.procedures);
  const totalCents = procedures.reduce((soma, p) => soma + (p.priceCents || 0) * (p.quantity || 1), 0);
  // Campo só de exibição/rascunho - "Gerar Cobrança" ainda não manda pra
  // gateway nenhum (ver comentário no botão), então não há pra onde
  // persistir um valor diferente do total calculado dos procedimentos.
  const [valorCobranca, setValorCobranca] = useState(() => formatCents(totalCents, i18n.language).replace(/[^\d,.-]/g, ""));

  async function mudarStatus(status) {
    setSalvando(true);
    try {
      await api.scUpdateAppointment(appointment.id, { status });
      await onChanged();
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  // Um PATCH por campo, no blur (não a cada tecla) - CID e nome do convênio
  // são texto livre digitado devagar, diferente de status/pagamento que são
  // clique único. Nota de satisfação não passa por aqui: é clique direto na
  // estrela, sem estado de digitação no meio.
  const [cidCode, setCidCode] = useState(appointment.cid_code || "");
  const [cidDescription, setCidDescription] = useState(appointment.cid_description || "");
  const [insuranceProvider, setInsuranceProvider] = useState(appointment.insurance_provider || "");
  async function salvarCampo(campo, valor) {
    try {
      await api.scUpdateAppointment(appointment.id, { [campo]: valor });
      await onChanged();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }
  async function definirSatisfacao(nota) {
    await salvarCampo("satisfactionScore", nota === appointment.satisfaction_score ? null : nota);
  }

  async function lancarRecebimento() {
    setSalvando(true);
    try {
      await api.scUpdateAppointment(appointment.id, { paymentStatus: "pago" });
      showToast(t("saudeClinicas.agenda.recebimentoLancado"));
      await onChanged();
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  async function cancelar() {
    setSalvando(true);
    try {
      await api.scUpdateAppointment(appointment.id, { status: "cancelado" });
      await onChanged();
      onClose();
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  function enviarLembrete() {
    const texto = t("saudeClinicas.agenda.mensagemLembrete", { data: appointment.date, hora: appointment.time });
    window.open(whatsappLink(patient.phone, texto), "_blank", "noopener,noreferrer");
  }

  const dataLegivel = new Date(appointment.date + "T00:00:00").toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long" });
  const horaFim = minutosParaHora(paraMinutos(appointment.time) + appointment.duration_min);

  if (logAberto) {
    return <AppointmentLogModal appointment={appointment} patient={patient} onClose={onClose} />;
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sc-detail-modal">
        <div className="sc-detail-topo">
          <span className="sc-detail-titulo">{t("saudeClinicas.agenda.detalhes")}</span>
          <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
        </div>

        <div className="sc-detail-paciente">
          <span className="sc-detail-avatar">{iniciais(patient.name)}</span>
          <div className="sc-detail-paciente-info">
            <span className="sc-detail-paciente-nome">{patient.name}</span>
            {patient.gender && <span className="sc-hint">{t(`saudeClinicas.pacientes.genero.${patient.gender}`)}</span>}
            <span className="sc-hint">{patient.phone || "-"}</span>
          </div>
          <div className="sc-detail-paciente-meta">
            <span className="sc-hint">
              {idade ? t("saudeClinicas.agenda.idade", { anos: idade.anos, meses: idade.meses, dias: idade.dias }) : t("saudeClinicas.agenda.idadeNaoInformada")}
            </span>
            <span className="sc-hint">
              {t("saudeClinicas.agenda.ultimaConsulta")}: {ultimaConsulta ? tempoRelativo(minutosDesde(ultimaConsulta.date, ultimaConsulta.time), t) : t("saudeClinicas.agenda.semConsultaAnterior")}
            </span>
          </div>
        </div>

        <button type="button" className="btn-secondary btn-small sc-detail-lembrete" onClick={enviarLembrete} disabled={!patient.phone}>
          {t("saudeClinicas.agenda.enviarLembrete")}
        </button>

        <div className="sc-detail-linha-data">
          <span className="sc-detail-data">{dataLegivel} - {appointment.time} {t("saudeClinicas.agenda.as")} {horaFim}</span>
          <select className="sc-detail-status" value={appointment.status} onChange={(e) => mudarStatus(e.target.value)} disabled={salvando}>
            {STATUS_VALIDOS.map((s) => (
              <option key={s} value={s}>{t(`saudeClinicas.agenda.status.${s}`)}</option>
            ))}
          </select>
        </div>

        <div className="sc-detail-cobranca">
          <span>{t("saudeClinicas.agenda.cobrarAgendamento")}</span>
          <div className="sc-detail-cobranca-acao">
            <label className="sc-detail-valor-campo">
              <span className="sc-hint">{t("saudeClinicas.agenda.valorCobranca")}</span>
              <input type="text" inputMode="decimal" value={valorCobranca} onChange={(e) => setValorCobranca(e.target.value)} />
            </label>
            {/* Sem gateway pra cobrar o PACIENTE ainda (o billing atual só
                cobra a própria clínica pela assinatura, via Asaas) - fica
                travado como "Em breve" no mesmo padrão do resto do módulo,
                até a clínica escolher a forma de pagamento na implantação. */}
            <button type="button" className="sc-detail-gerar-cobranca" disabled title={t("modules.comingSoon")}>
              {t("saudeClinicas.agenda.gerarCobranca")}
            </button>
          </div>
        </div>
        <p className="sc-hint">{t(`saudeClinicas.agenda.${appointment.payment_type}`)}</p>

        {appointment.payment_type === "convenio" && (
          <label className="sc-patient-campo">
            <span className="sc-hint">{t("saudeClinicas.agenda.nomeConvenio")}</span>
            <input type="text" value={insuranceProvider} onChange={(e) => setInsuranceProvider(e.target.value)} onBlur={() => salvarCampo("insuranceProvider", insuranceProvider)} placeholder={t("saudeClinicas.agenda.nomeConvenioPlaceholder")} />
          </label>
        )}

        <div className="sc-agenda-linha">
          <label className="sc-patient-campo">
            <span className="sc-hint">{t("saudeClinicas.agenda.cid")}</span>
            <input type="text" value={cidCode} onChange={(e) => setCidCode(e.target.value)} onBlur={() => salvarCampo("cidCode", cidCode)} placeholder="F32.1" />
          </label>
          <label className="sc-patient-campo sc-patient-campo-grande">
            <span className="sc-hint">{t("saudeClinicas.agenda.cidDescricao")}</span>
            <input type="text" value={cidDescription} onChange={(e) => setCidDescription(e.target.value)} onBlur={() => salvarCampo("cidDescription", cidDescription)} />
          </label>
        </div>

        <div className="sc-detail-satisfacao">
          <span className="sc-hint">{t("saudeClinicas.agenda.satisfacao")}</span>
          <div className="sc-detail-estrelas">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className={"sc-detail-estrela" + (n <= (appointment.satisfaction_score || 0) ? " active" : "")} onClick={() => definirSatisfacao(n)} title={String(n)}>
                <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              </button>
            ))}
          </div>
        </div>

        {procedures.length > 0 && (
          <>
            <table className="sc-detail-procedimentos">
              <thead>
                <tr>
                  <th>{t("saudeClinicas.agenda.procedimento")}</th>
                  <th className="fin-num">{t("saudeClinicas.agenda.quant")}</th>
                  <th className="fin-num">{t("saudeClinicas.agenda.valor")}</th>
                </tr>
              </thead>
              <tbody>
                {procedures.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td className="fin-num">{p.quantity}</td>
                    <td className="fin-num">{formatCents(p.priceCents, i18n.language)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>{t("saudeClinicas.agenda.totalReceber")}</td>
                  <td className="fin-num">{formatCents(totalCents, i18n.language)}</td>
                </tr>
              </tfoot>
            </table>
          </>
        )}

        <div className="sc-detail-rodape">
          {confirmarCancelar ? (
            <span className="sc-detail-confirm">
              <span className="sc-hint">{t("saudeClinicas.agenda.confirmarCancelar")}</span>
              <button type="button" className="btn-danger btn-small" onClick={cancelar} disabled={salvando}>{t("saudeClinicas.agenda.cancelarAgendamento")}</button>
              <button type="button" className="btn-ghost btn-small" onClick={() => setConfirmarCancelar(false)}>{t("common.cancel")}</button>
            </span>
          ) : (
            <span className="sc-detail-rodape-icones">
              <button type="button" className="icon-btn" title={t("saudeClinicas.agenda.cancelarAgendamento")} onClick={() => setConfirmarCancelar(true)}>
                <svg viewBox="0 0 24 24" width="17" height="17"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V4h6v3m-9 0 1 13h8l1-13" /></svg>
              </button>
              <button type="button" className="icon-btn" title={t("saudeClinicas.agenda.verLog")} onClick={() => setLogAberto(true)}>
                <svg viewBox="0 0 24 24" width="17" height="17"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" /></svg>
              </button>
            </span>
          )}
          <div className="sc-detail-rodape-acoes">
            {appointment.payment_status !== "pago" && procedures.length > 0 && (
              <button type="button" className="btn-secondary btn-small" onClick={lancarRecebimento} disabled={salvando}>{t("saudeClinicas.agenda.lancarRecebimento")}</button>
            )}
            <button type="button" className="btn-secondary btn-small" onClick={onEditar}>{t("saudeClinicas.agenda.editarAgendamento")}</button>
            <button type="button" className="btn-primary btn-small" onClick={() => mudarStatus("em_atendimento")} disabled={salvando || appointment.status === "em_atendimento"}>
              {t("saudeClinicas.agenda.iniciarAtendimento")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
