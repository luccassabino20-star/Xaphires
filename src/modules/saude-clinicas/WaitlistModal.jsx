import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { mascararTelefone, hojeCivil } from "./agendaUtils.js";

const NOVO_VAZIO = { name: "", phone: "", procedureId: "", preferredPeriod: "qualquer", notes: "" };

// Lista de espera: layout em duas colunas - lista à esquerda, cadastro rápido
// à direita. "Agendar" abre um mini-formulário inline na própria linha (em
// vez de empilhar mais um modal em cima deste) para escolher quando/quem
// atende, e chama a conversão (POST .../converter).
export default function WaitlistModal({ professionals, procedures, onClose, onConverted }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState(NOVO_VAZIO);
  const [agendandoId, setAgendandoId] = useState(null);
  const [agendaForm, setAgendaForm] = useState(null);

  async function carregar() {
    try {
      setItens(await api.scListWaitlist());
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  async function adicionar(e) {
    e.preventDefault();
    if (!novo.name.trim()) return;
    try {
      await api.scCreateWaitlistEntry(novo);
      showToast(t("saudeClinicas.agenda.esperaAdicionada"));
      setNovo(NOVO_VAZIO);
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function cancelar(id) {
    try {
      await api.scCancelarEspera(id);
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  function abrirAgendar(item) {
    setAgendandoId(item.id);
    setAgendaForm({ professionalUserId: professionals[0]?.id || "", date: hojeCivil(), time: "09:00", durationMin: 30 });
  }

  async function confirmarAgendar(id) {
    try {
      await api.scConverterEspera(id, agendaForm);
      showToast(t("saudeClinicas.agenda.esperaConvertida"));
      setAgendandoId(null);
      await carregar();
      onConverted?.();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sc-waitlist-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
        <h3 className="sc-config-title">{t("saudeClinicas.agenda.listaEspera")}</h3>
        {erro && <div className="sc-error">{erro}</div>}

        <div className="sc-waitlist-cols">
          <div className="sc-waitlist-lista">
            {itens.length === 0 ? (
              <p className="sc-empty">{t("saudeClinicas.agenda.esperaVazia")}</p>
            ) : (
              itens.map((item) => (
                <div className="sc-waitlist-item" key={item.id}>
                  <div className="sc-waitlist-item-topo">
                    <span className="sc-waitlist-item-nome">{item.name}</span>
                    <span className="sc-badge">{t(`saudeClinicas.agenda.periodo.${item.preferred_period}`)}</span>
                  </div>
                  <span className="sc-hint">{item.phone || "-"}</span>
                  {agendandoId === item.id ? (
                    <div className="sc-agenda-linha sc-waitlist-agendar-form">
                      <select value={agendaForm.professionalUserId} onChange={(e) => setAgendaForm({ ...agendaForm, professionalUserId: e.target.value })}>
                        <option value="">{t("saudeClinicas.agenda.semProfissional")}</option>
                        {professionals.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                      <input type="date" value={agendaForm.date} onChange={(e) => setAgendaForm({ ...agendaForm, date: e.target.value })} />
                      <input type="time" step={900} value={agendaForm.time} onChange={(e) => setAgendaForm({ ...agendaForm, time: e.target.value })} />
                      <button type="button" className="btn-primary btn-small" onClick={() => confirmarAgendar(item.id)}>{t("common.save")}</button>
                      <button type="button" className="btn-ghost btn-small" onClick={() => setAgendandoId(null)}>{t("common.cancel")}</button>
                    </div>
                  ) : (
                    <div className="sc-waitlist-item-acoes">
                      <button type="button" className="btn-primary btn-small" onClick={() => abrirAgendar(item)}>{t("saudeClinicas.agenda.agendar")}</button>
                      <button type="button" className="btn-ghost btn-small" onClick={() => cancelar(item.id)}>{t("common.cancel")}</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <form className="sc-waitlist-form" onSubmit={adicionar}>
            <h4 className="sc-config-title">{t("saudeClinicas.agenda.novaEspera")}</h4>
            <input type="text" placeholder={t("crm.contatos.nome")} value={novo.name} onChange={(e) => setNovo({ ...novo, name: e.target.value })} />
            <input type="text" placeholder={t("crm.contatos.telefone")} value={novo.phone} onChange={(e) => setNovo({ ...novo, phone: mascararTelefone(e.target.value) })} />
            <select value={novo.procedureId} onChange={(e) => setNovo({ ...novo, procedureId: e.target.value })}>
              <option value="">{t("saudeClinicas.agenda.semProcedimento")}</option>
              {procedures.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select value={novo.preferredPeriod} onChange={(e) => setNovo({ ...novo, preferredPeriod: e.target.value })}>
              <option value="qualquer">{t("saudeClinicas.agenda.periodo.qualquer")}</option>
              <option value="manha">{t("saudeClinicas.agenda.periodo.manha")}</option>
              <option value="tarde">{t("saudeClinicas.agenda.periodo.tarde")}</option>
            </select>
            <textarea placeholder={t("saudeClinicas.pacientes.notas")} value={novo.notes} onChange={(e) => setNovo({ ...novo, notes: e.target.value })} rows={2} />
            <button type="submit" className="btn-primary btn-small" disabled={!novo.name.trim()}>{t("common.add")}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
