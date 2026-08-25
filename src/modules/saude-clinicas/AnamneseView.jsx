import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { whatsappLink } from "../../utils/contact.js";

const TIPOS_CAMPO = ["text", "textarea", "email", "tel", "date", "single_choice", "multi_choice", "boolean", "file", "section"];
const AREAS_TEMPLATE = ["", "ESTETICA", "BIOMEDICINA_ESTETICA", "NUTRICAO"];

// Fichas de Anamnese: duas seções internas - Templates (lista + construtor de
// campos) e Respostas (por paciente: criar rascunho, enviar o link de
// pré-anamnese por WhatsApp, acompanhar o status).
export default function AnamneseView() {
  const { t } = useTranslation();
  const showToast = useToast();
  const [secao, setSecao] = useState("templates");
  const [templates, setTemplates] = useState([]);
  const [patients, setPatients] = useState([]);
  const [erro, setErro] = useState("");

  async function carregar() {
    try {
      const [tpls, pats] = await Promise.all([api.scListAnamneseTemplates(), api.scListPatients()]);
      setTemplates(tpls);
      setPatients(pats);
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  return (
    <div className="sc-cad-secao">
      <nav className="sc-subtabs">
        <button type="button" className={"sc-subtab" + (secao === "templates" ? " active" : "")} onClick={() => setSecao("templates")}>
          {t("saudeClinicas.anamnese.abaTemplates")}
        </button>
        <button type="button" className={"sc-subtab" + (secao === "respostas" ? " active" : "")} onClick={() => setSecao("respostas")}>
          {t("saudeClinicas.anamnese.abaRespostas")}
        </button>
      </nav>

      {erro && <div className="sc-error">{erro}</div>}

      {secao === "templates" ? (
        <SecaoTemplates templates={templates} onCriado={carregar} />
      ) : (
        <SecaoRespostas templates={templates} patients={patients} showToast={showToast} />
      )}
    </div>
  );
}

function SecaoTemplates({ templates, onCriado }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clinicArea, setClinicArea] = useState("");
  const [campos, setCampos] = useState([]);

  function adicionarCampo() {
    setCampos((c) => [...c, { id: `campo_${c.length + 1}_${Date.now()}`, label: "", type: "text", required: false, alert: false, options: "" }]);
  }
  function atualizarCampo(i, patch) {
    setCampos((c) => c.map((campo, idx) => (idx === i ? { ...campo, ...patch } : campo)));
  }
  function removerCampo(i) {
    setCampos((c) => c.filter((_, idx) => idx !== i));
  }

  async function criar(e) {
    e.preventDefault();
    if (!name.trim() || campos.length === 0) return;
    const fields = campos.map((c) => ({
      id: c.id,
      label: c.label.trim(),
      type: c.type,
      required: c.required,
      alert: c.alert,
      options: ["single_choice", "multi_choice"].includes(c.type)
        ? c.options.split(",").map((o) => o.trim()).filter(Boolean)
        : undefined,
    }));
    try {
      await api.scCreateAnamneseTemplate({ name: name.trim(), description, clinicArea: clinicArea || null, fields });
      showToast(t("saudeClinicas.anamnese.templateCriado"));
      setName("");
      setDescription("");
      setClinicArea("");
      setCampos([]);
      await onCriado();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  return (
    <div>
      <form className="sc-form sc-form-column" onSubmit={criar}>
        <input type="text" placeholder={t("saudeClinicas.anamnese.nomeTemplate")} value={name} onChange={(e) => setName(e.target.value)} />
        <input type="text" placeholder={t("saudeClinicas.anamnese.descricaoTemplate")} value={description} onChange={(e) => setDescription(e.target.value)} />
        <select value={clinicArea} onChange={(e) => setClinicArea(e.target.value)}>
          {AREAS_TEMPLATE.map((a) => (
            <option key={a} value={a}>{a ? t(`saudeClinicas.clinicType.${a}`) : t("saudeClinicas.anamnese.universal")}</option>
          ))}
        </select>

        <div className="sc-campos-builder">
          {campos.map((c, i) => (
            <div className={"sc-campo-row" + (c.type === "section" ? " sc-campo-row-section" : "")} key={c.id}>
              <input
                type="text"
                placeholder={c.type === "section" ? t("saudeClinicas.anamnese.tituloSecaoPlaceholder") : t("saudeClinicas.anamnese.perguntaLabel")}
                value={c.label}
                onChange={(e) => atualizarCampo(i, { label: e.target.value })}
              />
              <select value={c.type} onChange={(e) => atualizarCampo(i, { type: e.target.value })}>
                {TIPOS_CAMPO.map((tp) => (
                  <option key={tp} value={tp}>{t(`saudeClinicas.anamnese.tipoCampo.${tp}`)}</option>
                ))}
              </select>
              {["single_choice", "multi_choice"].includes(c.type) && (
                <input type="text" placeholder={t("saudeClinicas.anamnese.opcoesPlaceholder")} value={c.options} onChange={(e) => atualizarCampo(i, { options: e.target.value })} />
              )}
              {/* Seção é só um título entre perguntas - não tem resposta, então
                  "obrigatório"/"alerta" não fazem sentido nela. */}
              {c.type !== "section" && (
                <>
                  <label className="sc-checkbox">
                    <input type="checkbox" checked={c.required} onChange={(e) => atualizarCampo(i, { required: e.target.checked })} />
                    {t("saudeClinicas.anamnese.obrigatorio")}
                  </label>
                  <label className="sc-checkbox sc-checkbox-alert">
                    <input type="checkbox" checked={c.alert} onChange={(e) => atualizarCampo(i, { alert: e.target.checked })} />
                    {t("saudeClinicas.anamnese.alerta")}
                  </label>
                </>
              )}
              <button type="button" className="btn-ghost btn-small" onClick={() => removerCampo(i)}>{t("common.remove")}</button>
            </div>
          ))}
          <button type="button" className="btn-secondary btn-small" onClick={adicionarCampo}>{t("saudeClinicas.anamnese.adicionarPergunta")}</button>
        </div>

        <button type="submit" className="btn-primary btn-small" disabled={!name.trim() || campos.length === 0}>
          {t("saudeClinicas.anamnese.salvarTemplate")}
        </button>
      </form>

      <ul className="sc-template-list">
        {templates.map((tpl) => (
          <li key={tpl.id} className="sc-template-item">
            <span className="sc-template-nome">{tpl.name}</span>
            <span className="sc-badge">{tpl.clinic_area ? t(`saudeClinicas.clinicType.${tpl.clinic_area}`) : t("saudeClinicas.anamnese.universal")}</span>
            <span className="sc-template-campos">{t("saudeClinicas.anamnese.nPerguntas", { count: tpl.fields.length })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SecaoRespostas({ templates, patients, showToast }) {
  const { t } = useTranslation();
  const [patientId, setPatientId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [respostas, setRespostas] = useState([]);
  const [enviando, setEnviando] = useState(null);

  const paciente = useMemo(() => patients.find((p) => p.id === patientId), [patients, patientId]);

  useEffect(() => {
    if (!patientId) {
      setRespostas([]);
      return;
    }
    api.scListAnamneseResponses(patientId).then(setRespostas).catch((e) => showToast(translateError(e, t)));
    // eslint-disable-next-line
  }, [patientId]);

  async function novaFichaEEnviar() {
    if (!patientId || !templateId) return;
    setEnviando("nova");
    try {
      const rascunho = await api.scCreateAnamneseResponse(templateId, patientId);
      const enviado = await api.scEnviarAnamneseResponse(rascunho.id);
      abrirWhatsapp(enviado);
      setRespostas(await api.scListAnamneseResponses(patientId));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setEnviando(null);
    }
  }

  async function reenviar(resp) {
    setEnviando(resp.id);
    try {
      const enviado = await api.scEnviarAnamneseResponse(resp.id);
      abrirWhatsapp(enviado);
      setRespostas(await api.scListAnamneseResponses(patientId));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setEnviando(null);
    }
  }

  function abrirWhatsapp(resp) {
    const url = `${window.location.origin}/anamnese/${resp.companyId}/${resp.share_token}`;
    const texto = t("saudeClinicas.anamnese.mensagemWhatsapp", { url });
    window.open(whatsappLink(paciente?.phone, texto), "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div className="sc-form">
        <select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
          <option value="">{t("saudeClinicas.anamnese.escolhaPaciente")}</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">{t("saudeClinicas.anamnese.escolhaTemplate")}</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
          ))}
        </select>
        <button type="button" className="btn-primary btn-small" disabled={!patientId || !templateId || enviando === "nova"} onClick={novaFichaEEnviar}>
          {enviando === "nova" ? t("saudeClinicas.anamnese.enviando") : t("saudeClinicas.anamnese.novaFichaEnviar")}
        </button>
      </div>

      {!patientId ? (
        <p className="sc-hint">{t("saudeClinicas.anamnese.selecionePaciente")}</p>
      ) : (
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th>{t("saudeClinicas.anamnese.colTemplate")}</th>
                <th>{t("saudeClinicas.anamnese.colStatus")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {respostas.length === 0 ? (
                <tr>
                  <td colSpan={3} className="sc-empty">{t("saudeClinicas.anamnese.vazioRespostas")}</td>
                </tr>
              ) : (
                respostas.map((r) => {
                  const tpl = templates.find((x) => x.id === r.template_id);
                  return (
                    <tr key={r.id}>
                      <td>{tpl?.name || "-"}</td>
                      <td>
                        <span className={"sc-badge sc-badge-" + r.status}>{t(`saudeClinicas.anamnese.status.${r.status}`)}</span>
                      </td>
                      <td className="sc-row-actions">
                        {r.status !== "respondido" && (
                          <button type="button" className="btn-ghost btn-small" disabled={enviando === r.id} onClick={() => reenviar(r)}>
                            {enviando === r.id ? t("saudeClinicas.anamnese.enviando") : t("saudeClinicas.anamnese.enviarWhatsapp")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
