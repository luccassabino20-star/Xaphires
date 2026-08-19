import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents } from "../financeiro/dinheiro.js";
import { mascararTelefone } from "./agendaUtils.js";

function parseProcedures(json) {
  try {
    const arr = typeof json === "string" ? JSON.parse(json) : json;
    return Array.isArray(arr) ? arr.map((p) => ({ name: p.name, priceCents: p.priceCents, quantity: p.quantity || 1 })) : [];
  } catch {
    return [];
  }
}

// Modal de "Adicionar agendamento" / "Bloquear horário", em abas - mesmo
// negócio, formulários diferentes, por isso um modal só (evita o usuário ter
// que decidir "qual botão" antes de saber que existe a opção de bloquear).
// Com `agendamentoExistente`, vira o formulário de edição (chamado do
// AppointmentDetailModal): sem abas (só agendamento), sem o fluxo de "novo
// paciente" inline, e salva com PATCH em vez de POST.
export default function AppointmentModal({
  initialDate, initialTime, initialPatientId, agendamentoExistente,
  professionals, patients, procedures, onClose, onSaved,
}) {
  const { t, i18n } = useTranslation();
  const editando = !!agendamentoExistente;
  const [aba, setAba] = useState("agendamento"); // 'agendamento' | 'bloqueio'
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  // ---- Agendamento ----
  const [patientId, setPatientId] = useState(agendamentoExistente?.patient_id || initialPatientId || "");
  const [novoPacienteNome, setNovoPacienteNome] = useState("");
  const [novoPacienteTelefone, setNovoPacienteTelefone] = useState("");
  const [professionalUserId, setProfessionalUserId] = useState(agendamentoExistente?.professional_user_id || professionals[0]?.id || "");
  const [date, setDate] = useState(agendamentoExistente?.date || initialDate);
  const [time, setTime] = useState(agendamentoExistente?.time || initialTime);
  const [durationMin, setDurationMin] = useState(agendamentoExistente?.duration_min || 30);
  // Itens com procedureId vieram do catálogo nesta sessão (o <select> continua
  // trocável); itens sem procedureId são snapshot histórico (edição não
  // reescreve preço/nome de um procedimento já registrado - só permite
  // adicionar novos ou remover). Ver parseProcedures acima.
  const [itensProcedimento, setItensProcedimento] = useState(() => parseProcedures(agendamentoExistente?.procedures));
  const [paymentType, setPaymentType] = useState(agendamentoExistente?.payment_type || "particular");
  const [paymentStatus, setPaymentStatus] = useState(agendamentoExistente?.payment_status || "pendente");
  const [notes, setNotes] = useState(agendamentoExistente?.notes || "");

  // ---- Bloqueio ----
  const [blockProfessionalUserId, setBlockProfessionalUserId] = useState("");
  const [blockDate, setBlockDate] = useState(initialDate);
  const [blockTime, setBlockTime] = useState(initialTime);
  const [blockDuration, setBlockDuration] = useState(30);
  const [reason, setReason] = useState("");

  const totalCents = useMemo(() => itensProcedimento.reduce((soma, it) => soma + (it.priceCents || 0) * it.quantity, 0), [itensProcedimento]);

  function adicionarProcedimento() {
    if (procedures.length === 0) return;
    const primeiro = procedures[0];
    setItensProcedimento((prev) => [...prev, { procedureId: primeiro.id, name: primeiro.name, priceCents: primeiro.price_cents, quantity: 1 }]);
    if (itensProcedimento.length === 0) setDurationMin(primeiro.duration_min || 30);
  }
  function atualizarProcedimento(i, patch) {
    setItensProcedimento((prev) =>
      prev.map((it, idx) => {
        if (idx !== i) return it;
        if (patch.procedureId !== undefined) {
          const proc = procedures.find((p) => p.id === patch.procedureId);
          return proc ? { ...it, procedureId: proc.id, name: proc.name, priceCents: proc.price_cents } : it;
        }
        return { ...it, ...patch };
      })
    );
  }
  function removerProcedimento(i) {
    setItensProcedimento((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function salvarAgendamento(e) {
    e.preventDefault();
    if (!editando && !patientId && !novoPacienteNome.trim()) return;
    setSalvando(true);
    setErro("");
    const payload = {
      professionalUserId: professionalUserId || null,
      date,
      time,
      durationMin: Number(durationMin) || 30,
      paymentType,
      paymentStatus,
      procedures: itensProcedimento.map((it) => ({ name: it.name, priceCents: it.priceCents, quantity: it.quantity })),
      notes,
    };
    try {
      if (editando) {
        await api.scUpdateAppointment(agendamentoExistente.id, payload);
      } else {
        await api.scCreateAppointment({
          ...payload,
          patientId: patientId || undefined,
          patientName: patientId ? undefined : novoPacienteNome.trim(),
          patientPhone: patientId ? undefined : novoPacienteTelefone,
        });
      }
      onSaved();
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  async function salvarBloqueio(e) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    try {
      await api.scCreateBlock({
        professionalUserId: blockProfessionalUserId || null,
        date: blockDate,
        time: blockTime,
        durationMin: Number(blockDuration) || 30,
        reason,
      });
      onSaved();
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sc-agenda-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
        {editando ? (
          <h3 className="sc-config-title">{t("saudeClinicas.agenda.editarAgendamento")}</h3>
        ) : (
          <nav className="sc-subtabs">
            <button type="button" className={"sc-subtab" + (aba === "agendamento" ? " active" : "")} onClick={() => setAba("agendamento")}>
              {t("saudeClinicas.agenda.abaAgendamento")}
            </button>
            <button type="button" className={"sc-subtab" + (aba === "bloqueio" ? " active" : "")} onClick={() => setAba("bloqueio")}>
              {t("saudeClinicas.agenda.abaBloqueio")}
            </button>
          </nav>
        )}

        {erro && <div className="sc-error">{erro}</div>}

        {aba === "agendamento" || editando ? (
          <form className="sc-form sc-form-column" onSubmit={salvarAgendamento}>
            {editando ? (
              <select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ) : (
              <>
                <select value={patientId} onChange={(e) => { setPatientId(e.target.value); if (e.target.value) setNovoPacienteNome(""); }}>
                  <option value="">{t("saudeClinicas.agenda.novoPaciente")}</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {!patientId && (
                  <div className="sc-agenda-linha">
                    <input type="text" placeholder={t("crm.contatos.nome")} value={novoPacienteNome} onChange={(e) => setNovoPacienteNome(e.target.value)} />
                    <input
                      type="text" placeholder={t("crm.contatos.telefone")} value={novoPacienteTelefone}
                      onChange={(e) => setNovoPacienteTelefone(mascararTelefone(e.target.value))}
                    />
                  </div>
                )}
              </>
            )}

            <div className="sc-agenda-linha">
              <select value={professionalUserId} onChange={(e) => setProfessionalUserId(e.target.value)}>
                <option value="">{t("saudeClinicas.agenda.semProfissional")}</option>
                {professionals.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            <div className="sc-agenda-linha">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} step={900} />
              <input type="number" min={5} step={5} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} title={t("saudeClinicas.agenda.duracaoMin")} />
              <span className="sc-hint">{t("saudeClinicas.agenda.duracaoMin")}</span>
            </div>

            <div className="sc-procedimentos-lista">
              {itensProcedimento.map((it, i) => (
                <div className="sc-agenda-linha" key={i}>
                  {it.procedureId ? (
                    <select value={it.procedureId} onChange={(e) => atualizarProcedimento(i, { procedureId: e.target.value })}>
                      {procedures.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} - {formatCents(p.price_cents, i18n.language)}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="sc-agenda-proc-nome">{it.name} - {formatCents(it.priceCents, i18n.language)}</span>
                  )}
                  <input type="number" min={1} value={it.quantity} onChange={(e) => atualizarProcedimento(i, { quantity: Number(e.target.value) || 1 })} />
                  <button type="button" className="btn-ghost btn-small" onClick={() => removerProcedimento(i)}>{t("common.remove")}</button>
                </div>
              ))}
              <button type="button" className="btn-secondary btn-small" onClick={adicionarProcedimento} disabled={procedures.length === 0}>
                {t("saudeClinicas.agenda.adicionarProcedimento")}
              </button>
              {totalCents > 0 && <span className="sc-agenda-total">{t("saudeClinicas.agenda.total")}: {formatCents(totalCents, i18n.language)}</span>}
            </div>

            <div className="sc-agenda-pagamento">
              <div className="sc-toggle-group">
                <button type="button" className={"sc-toggle-btn" + (paymentType === "particular" ? " active" : "")} onClick={() => setPaymentType("particular")}>
                  {t("saudeClinicas.agenda.particular")}
                </button>
                <button type="button" className={"sc-toggle-btn" + (paymentType === "convenio" ? " active" : "")} onClick={() => setPaymentType("convenio")}>
                  {t("saudeClinicas.agenda.convenio")}
                </button>
              </div>
              <label className="sc-checkbox">
                <input type="checkbox" checked={paymentStatus === "pago"} onChange={(e) => setPaymentStatus(e.target.checked ? "pago" : "pendente")} />
                {t("saudeClinicas.agenda.pago")}
              </label>
            </div>

            <textarea placeholder={t("saudeClinicas.pacientes.notas")} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />

            <div className="sc-modal-acoes">
              <button type="submit" className="btn-primary" disabled={salvando || (!editando && !patientId && !novoPacienteNome.trim())}>
                {salvando ? t("saudeClinicas.anamnese.enviando") : editando ? t("common.save") : t("saudeClinicas.agenda.salvarAgendamento")}
              </button>
            </div>
          </form>
        ) : (
          <form className="sc-form sc-form-column" onSubmit={salvarBloqueio}>
            <select value={blockProfessionalUserId} onChange={(e) => setBlockProfessionalUserId(e.target.value)}>
              <option value="">{t("saudeClinicas.agenda.todosProfissionais")}</option>
              {professionals.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <div className="sc-agenda-linha">
              <input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} />
              <input type="time" value={blockTime} onChange={(e) => setBlockTime(e.target.value)} step={900} />
              <input type="number" min={5} step={5} value={blockDuration} onChange={(e) => setBlockDuration(e.target.value)} />
              <span className="sc-hint">{t("saudeClinicas.agenda.duracaoMin")}</span>
            </div>
            <input type="text" placeholder={t("saudeClinicas.agenda.motivo")} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="sc-modal-acoes">
              <button type="submit" className="btn-primary" disabled={salvando}>
                {salvando ? t("saudeClinicas.anamnese.enviando") : t("saudeClinicas.agenda.salvarBloqueio")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
