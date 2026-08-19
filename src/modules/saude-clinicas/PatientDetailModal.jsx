import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { mascararTelefone } from "./agendaUtils.js";

const ESTADOS_BR = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal", "Espírito Santo", "Goiás",
  "Maranhão", "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco",
  "Piauí", "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima", "Santa Catarina",
  "São Paulo", "Sergipe", "Tocantins",
];

// O ViaCEP devolve a sigla (SP, RJ...), não o nome - a sigla não é prefixo do
// nome por extenso na maioria dos casos, então precisa de um mapa explícito.
const UF_PARA_ESTADO = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso",
  MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
  SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

function vazioFormulario(p) {
  return {
    name: p?.name || "",
    civilName: p?.civil_name || "",
    usaCivilName: !!p?.civil_name,
    birthDate: p?.birth_date || "",
    gender: p?.gender || "",
    socialGender: p?.social_gender || "",
    usaSocialGender: !!p?.social_gender,
    email: p?.email || "",
    cpf: p?.cpf || "",
    rg: p?.rg || "",
    notes: p?.notes || "",
    phone: p?.phone || "",
    phoneHome: p?.phone_home || "",
    phoneWork: p?.phone_work || "",
    smsReminderOptIn: !!p?.sms_reminder_opt_in,
    cep: p?.cep || "",
    address: p?.address || "",
    addressNumber: p?.address_number || "",
    complement: p?.complement || "",
    neighborhood: p?.neighborhood || "",
    city: p?.city || "",
    state: p?.state || "",
    country: p?.country || "Brasil",
  };
}

// Cadastro completo do paciente, em abas - a versão rica do formulário
// enxuto de PatientsView (que continua existindo pra edição rápida da
// listagem). Aberto tanto da listagem de pacientes quanto de "Dados do
// paciente" no log do agendamento (AppointmentLogModal).
// PATIENT_NOVO é o sentinel de "ainda não existe no banco" - permite este
// modal servir tanto de edição (aberto com um id real, de AppointmentLogModal
// ou de uma listagem futura) quanto de criação ("Salvar e adicionar outro"
// reseta pra este estado sem fechar o modal).
const PATIENT_NOVO = { id: null, patient_number: null, created_at: null, avatar_path: null };

export default function PatientDetailModal({ patientId, onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const fileInputRef = useRef(null);
  const [aba, setAba] = useState("pessoais"); // 'pessoais' | 'complementares' | 'convenios' | 'historico'
  const [currentId, setCurrentId] = useState(patientId || null);
  const [patient, setPatient] = useState(patientId ? null : PATIENT_NOVO);
  const [f, setF] = useState(vazioFormulario(null));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [historico, setHistorico] = useState(null);

  async function carregar(id) {
    try {
      const lista = await api.scListPatients();
      const encontrado = lista.find((p) => p.id === id);
      if (!encontrado) return setErro(t("saudeClinicas.pacientes.naoEncontrado"));
      setPatient(encontrado);
      setF(vazioFormulario(encontrado));
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    if (currentId) carregar(currentId);
    // eslint-disable-next-line
  }, [currentId]);

  useEffect(() => {
    if (aba !== "historico" || historico || !currentId) return;
    api
      .scListPatientAppointments(currentId)
      .then(setHistorico)
      .catch((e) => showToast(translateError(e, t)));
    // eslint-disable-next-line
  }, [aba, currentId]);

  const fotoUrl = useMemo(
    () => (patient?.avatar_path ? `/api/saude-clinicas/patients/${patient.id}/photo?v=${patient.avatar_path}` : null),
    [patient]
  );

  async function preencherPorCep(valor) {
    const digs = String(valor).replace(/\D/g, "");
    if (digs.length !== 8) return;
    setBuscandoCep(true);
    try {
      const e = await api.buscarCep(digs);
      setF((cur) => ({
        ...cur,
        address: e.logradouro || cur.address,
        neighborhood: e.bairro || cur.neighborhood,
        city: e.cidade || cur.city,
        state: e.uf ? UF_PARA_ESTADO[e.uf.toUpperCase()] || cur.state : cur.state,
      }));
    } catch {
      /* CEP não encontrado - deixa a pessoa preencher na mão */
    } finally {
      setBuscandoCep(false);
    }
  }

  function payload() {
    return {
      name: f.name.trim(),
      civilName: f.usaCivilName ? f.civilName : "",
      birthDate: f.birthDate,
      gender: f.gender,
      socialGender: f.usaSocialGender ? f.socialGender : "",
      email: f.email,
      cpf: f.cpf,
      rg: f.rg,
      notes: f.notes,
      phone: f.phone,
      phoneHome: f.phoneHome,
      phoneWork: f.phoneWork,
      smsReminderOptIn: f.smsReminderOptIn,
      cep: f.cep,
      address: f.address,
      addressNumber: f.addressNumber,
      complement: f.complement,
      neighborhood: f.neighborhood,
      city: f.city,
      state: f.state,
      country: f.country,
    };
  }

  async function salvar(depois) {
    if (!f.name.trim()) return;
    setSalvando(true);
    setErro("");
    try {
      const salvo = currentId ? await api.scUpdatePatient(currentId, payload()) : await api.scCreatePatient(payload());
      showToast(t("saudeClinicas.pacientes.salvo"));
      await onSaved?.();
      if (depois === "fechar") {
        onClose();
      } else if (depois === "novo") {
        setCurrentId(null);
        setPatient(PATIENT_NOVO);
        setF(vazioFormulario(null));
        setAba("pessoais");
      } else if (currentId) {
        await carregar(currentId);
      } else {
        // "Salvar e continuar editando" num paciente recém-criado: passa a
        // apontar pro id novo, senão o próximo salvar criaria outro igual.
        setCurrentId(salvo.id);
      }
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!currentId) return;
    setSalvando(true);
    try {
      await api.scUpdatePatient(currentId, { active: false });
      showToast(t("saudeClinicas.pacientes.desativado"));
      await onSaved?.();
      onClose();
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  async function enviarFoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !currentId) return;
    setEnviandoFoto(true);
    try {
      const atualizado = await api.scUploadPatientPhoto(currentId, file);
      setPatient(atualizado);
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setEnviandoFoto(false);
    }
  }

  if (!patient) {
    return (
      <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal sc-patient-modal">
          <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
          {erro ? <div className="sc-error">{erro}</div> : <p className="sc-hint">{t("common.loading")}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sc-patient-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
        <div className="sc-log-layout sc-patient-layout">
          <nav className="sc-log-nav">
            <button type="button" className={"sc-log-nav-item" + (aba === "pessoais" ? " active" : "")} onClick={() => setAba("pessoais")}>
              {t("saudeClinicas.pacientes.abaPessoais")}
            </button>
            <button type="button" className={"sc-log-nav-item" + (aba === "complementares" ? " active" : "")} onClick={() => setAba("complementares")}>
              {t("saudeClinicas.pacientes.abaComplementares")}
            </button>
            <button type="button" className="sc-log-nav-item disabled" disabled title={t("modules.comingSoon")}>
              {t("saudeClinicas.pacientes.abaConvenios")}
            </button>
            <button type="button" className={"sc-log-nav-item" + (aba === "historico" ? " active" : "")} onClick={() => setAba("historico")}>
              {t("saudeClinicas.pacientes.abaHistorico")}
            </button>
          </nav>

          <div className="sc-log-conteudo sc-patient-conteudo">
            <h3 className="sc-config-title">{patient.name}</h3>
            {erro && <div className="sc-error">{erro}</div>}

            {aba === "pessoais" && (
              <div className="sc-patient-grid">
                <div className="sc-patient-campos">
                  <div className="sc-agenda-linha">
                    <label className="sc-patient-campo sc-patient-campo-grande">
                      <span className="sc-hint">{t("saudeClinicas.pacientes.nome")}*</span>
                      <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                    </label>
                    <label className="sc-patient-campo">
                      <span className="sc-hint">{t("saudeClinicas.pacientes.codigo")}</span>
                      <input type="text" value={patient.patient_number || "-"} disabled />
                    </label>
                  </div>

                  <label className="sc-patient-campo">
                    <span className="sc-hint">{t("saudeClinicas.pacientes.nascimento")}*</span>
                    <input type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} />
                  </label>

                  <div className="sc-patient-campo">
                    <span className="sc-hint">{t("saudeClinicas.pacientes.sexo")}*</span>
                    <div className="sc-patient-radios">
                      {["masculino", "feminino", "outro"].map((g) => (
                        <label key={g} className="sc-checkbox">
                          <input type="radio" name="gender" checked={f.gender === g} onChange={() => setF({ ...f, gender: g })} />
                          {t(`saudeClinicas.pacientes.genero.${g}`)}
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="sc-checkbox">
                    <input type="checkbox" checked={f.usaCivilName} onChange={(e) => setF({ ...f, usaCivilName: e.target.checked })} />
                    {t("saudeClinicas.pacientes.nomeCivil")}
                  </label>
                  {f.usaCivilName && (
                    <input type="text" className="sc-patient-subcampo" placeholder={t("saudeClinicas.pacientes.nomeCivil")} value={f.civilName} onChange={(e) => setF({ ...f, civilName: e.target.value })} />
                  )}

                  <label className="sc-checkbox">
                    <input type="checkbox" checked={f.usaSocialGender} onChange={(e) => setF({ ...f, usaSocialGender: e.target.checked })} />
                    {t("saudeClinicas.pacientes.generoOpcional")}
                  </label>
                  {f.usaSocialGender && (
                    <input type="text" className="sc-patient-subcampo" placeholder={t("saudeClinicas.pacientes.generoOpcional")} value={f.socialGender} onChange={(e) => setF({ ...f, socialGender: e.target.value })} />
                  )}

                  <label className="sc-patient-campo">
                    <span className="sc-hint">{t("saudeClinicas.pacientes.email")}</span>
                    <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
                  </label>

                  <div className="sc-agenda-linha">
                    <label className="sc-patient-campo">
                      <span className="sc-hint">{t("saudeClinicas.pacientes.cpf")}</span>
                      <input type="text" value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} />
                    </label>
                    <label className="sc-patient-campo">
                      <span className="sc-hint">{t("saudeClinicas.pacientes.rg")}</span>
                      <input type="text" value={f.rg} onChange={(e) => setF({ ...f, rg: e.target.value })} />
                    </label>
                  </div>

                  <label className="sc-patient-campo">
                    <span className="sc-hint">{t("saudeClinicas.pacientes.notas")}</span>
                    <textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
                  </label>
                </div>

                <div className="sc-patient-foto">
                  {fotoUrl ? <img className="sc-patient-foto-img" src={fotoUrl} alt="" /> : <span className="sc-detail-avatar sc-patient-foto-vazia" />}
                  <p className="sc-hint">{currentId ? t("saudeClinicas.pacientes.imagemPerfilHint") : t("saudeClinicas.pacientes.salvePrimeiro")}</p>
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={enviarFoto} />
                  <button type="button" className="btn-secondary btn-small" onClick={() => fileInputRef.current?.click()} disabled={enviandoFoto || !currentId}>
                    {enviandoFoto ? t("common.loading") : t("saudeClinicas.pacientes.editarFoto")}
                  </button>
                  <button type="button" className="btn-primary btn-small" disabled title={t("modules.comingSoon")}>
                    {t("saudeClinicas.pacientes.verProntuario")}
                  </button>
                  {currentId && <p className="sc-hint">{t("saudeClinicas.pacientes.cadastradoEm", { data: new Date(patient.created_at).toLocaleString(i18n.language) })}</p>}
                </div>
              </div>
            )}

            {aba === "complementares" && (
              <div className="sc-patient-campos">
                <h4 className="sc-config-title">{t("saudeClinicas.pacientes.telefones")}</h4>
                <div className="sc-agenda-linha">
                  <label className="sc-patient-campo">
                    <span className="sc-hint">{t("saudeClinicas.pacientes.celular")}*</span>
                    <input type="text" value={f.phone} onChange={(e) => setF({ ...f, phone: mascararTelefone(e.target.value) })} />
                  </label>
                  <label className="sc-patient-campo">
                    <span className="sc-hint">{t("saudeClinicas.pacientes.telefoneCasa")}</span>
                    <input type="text" value={f.phoneHome} onChange={(e) => setF({ ...f, phoneHome: mascararTelefone(e.target.value) })} />
                  </label>
                  <label className="sc-patient-campo">
                    <span className="sc-hint">{t("saudeClinicas.pacientes.telefoneTrabalho")}</span>
                    <input type="text" value={f.phoneWork} onChange={(e) => setF({ ...f, phoneWork: mascararTelefone(e.target.value) })} />
                  </label>
                </div>

                <h4 className="sc-config-title">{t("saudeClinicas.pacientes.lembreteAgendamento")}</h4>
                <label className="sc-checkbox">
                  <input type="checkbox" checked={f.smsReminderOptIn} onChange={(e) => setF({ ...f, smsReminderOptIn: e.target.checked })} />
                  {t("saudeClinicas.pacientes.aceitaSms")}
                </label>
                <p className="sc-hint">{t("saudeClinicas.pacientes.smsEmBreve")}</p>

                <h4 className="sc-config-title">{t("saudeClinicas.pacientes.endereco")}</h4>
                <div className="sc-agenda-linha">
                  <label className="sc-patient-campo">
                    <span className="sc-hint">{t("financeiro.cad.cep")}</span>
                    <input
                      type="text" inputMode="numeric" value={f.cep}
                      onChange={(e) => { setF({ ...f, cep: e.target.value }); if (e.target.value.replace(/\D/g, "").length === 8) preencherPorCep(e.target.value); }}
                      onBlur={(e) => preencherPorCep(e.target.value)}
                    />
                  </label>
                  {buscandoCep && <span className="sc-hint">{t("financeiro.cad.buscandoCep")}</span>}
                </div>
                <div className="sc-agenda-linha">
                  <label className="sc-patient-campo sc-patient-campo-grande">
                    <span className="sc-hint">{t("saudeClinicas.pacientes.enderecoLabel")}</span>
                    <input type="text" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
                  </label>
                  <label className="sc-patient-campo">
                    <span className="sc-hint">{t("financeiro.cad.numero")}</span>
                    <input type="text" value={f.addressNumber} onChange={(e) => setF({ ...f, addressNumber: e.target.value })} />
                  </label>
                </div>
                <div className="sc-agenda-linha">
                  <label className="sc-patient-campo">
                    <span className="sc-hint">{t("financeiro.cad.complemento")}</span>
                    <input type="text" value={f.complement} onChange={(e) => setF({ ...f, complement: e.target.value })} />
                  </label>
                  <label className="sc-patient-campo">
                    <span className="sc-hint">{t("financeiro.cad.bairro")}</span>
                    <input type="text" value={f.neighborhood} onChange={(e) => setF({ ...f, neighborhood: e.target.value })} />
                  </label>
                </div>
                <div className="sc-agenda-linha">
                  <label className="sc-patient-campo">
                    <span className="sc-hint">{t("financeiro.cad.cidade")}</span>
                    <input type="text" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
                  </label>
                  <label className="sc-patient-campo">
                    <span className="sc-hint">{t("saudeClinicas.pacientes.estado")}</span>
                    <select value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
                      <option value="">-</option>
                      {ESTADOS_BR.map((uf) => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </label>
                  <label className="sc-patient-campo">
                    <span className="sc-hint">{t("financeiro.cad.pais")}</span>
                    <input type="text" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} />
                  </label>
                </div>
              </div>
            )}

            {aba === "historico" && (
              <div className="sc-table-wrap">
                <table className="sc-table">
                  <thead>
                    <tr>
                      <th>{t("saudeClinicas.agenda.colData")}</th>
                      <th>{t("saudeClinicas.agenda.colHora")}</th>
                      <th>{t("saudeClinicas.agenda.colStatus")}</th>
                      <th>{t("saudeClinicas.agenda.procedimento")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!historico ? (
                      <tr><td colSpan={4} className="sc-empty">{t("common.loading")}</td></tr>
                    ) : historico.length === 0 ? (
                      <tr><td colSpan={4} className="sc-empty">{t("saudeClinicas.pacientes.semHistorico")}</td></tr>
                    ) : (
                      historico.map((a) => (
                        <tr key={a.id}>
                          <td>{new Date(a.date + "T00:00:00").toLocaleDateString(i18n.language)}</td>
                          <td>{a.time}</td>
                          <td>{t(`saudeClinicas.agenda.status.${a.status}`)}</td>
                          <td>{(() => { try { return JSON.parse(a.procedures).map((p) => p.name).join(", ") || "-"; } catch { return "-"; } })()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {aba !== "historico" && (
              <div className="sc-patient-rodape">
                {!currentId ? (
                  <span />
                ) : confirmarExcluir ? (
                  <span className="sc-detail-confirm">
                    <span className="sc-hint">{t("saudeClinicas.pacientes.confirmarExcluir")}</span>
                    <button type="button" className="btn-danger btn-small" onClick={excluir} disabled={salvando}>{t("common.delete")}</button>
                    <button type="button" className="btn-ghost btn-small" onClick={() => setConfirmarExcluir(false)}>{t("common.cancel")}</button>
                  </span>
                ) : (
                  <button type="button" className="sc-patient-excluir" onClick={() => setConfirmarExcluir(true)}>
                    <svg viewBox="0 0 24 24" width="15" height="15"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V4h6v3m-9 0 1 13h8l1-13" /></svg>
                    {t("common.delete")}
                  </button>
                )}
                <div className="sc-patient-rodape-acoes">
                  <button type="button" className="btn-secondary btn-small" onClick={() => salvar("novo")} disabled={salvando || !f.name.trim()}>
                    {t("saudeClinicas.pacientes.salvarEAdicionarOutro")}
                  </button>
                  <button type="button" className="btn-secondary btn-small" onClick={() => salvar("continuar")} disabled={salvando || !f.name.trim()}>
                    {t("saudeClinicas.pacientes.salvarEContinuar")}
                  </button>
                  <button type="button" className="btn-primary btn-small" onClick={() => salvar("fechar")} disabled={salvando || !f.name.trim()}>
                    {t("common.save")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
