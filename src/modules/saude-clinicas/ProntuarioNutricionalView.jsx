import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { whatsappLink } from "../../utils/contact.js";

// Prontuário Nutricional: diferente da aba "Fichas de Anamnese" (que é o
// construtor de templates + o disparo do link por WhatsApp para TODAS as
// especialidades), esta tela é o outro lado do mesmo dado - ver e preencher,
// dentro do prontuário do paciente, a anamnese de NUTRIÇÃO especificamente.
// Reaproveita as mesmas rotas/tabelas de anamnesis_responses; não existe
// tabela ou conceito novo aqui, só uma leitura focada num paciente e numa
// especialidade.
export default function ProntuarioNutricionalView() {
  const { t } = useTranslation();
  const showToast = useToast();
  const [patients, setPatients] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [patientId, setPatientId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [respostas, setRespostas] = useState([]);
  const [respostaAtivaId, setRespostaAtivaId] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    Promise.all([api.scListPatients(), api.scListAnamneseTemplates()])
      .then(([pats, tpls]) => {
        setPatients(pats);
        setTemplates(tpls);
      })
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, []);

  const templatesNutricao = useMemo(() => templates.filter((tp) => tp.clinic_area === "NUTRICAO"), [templates]);

  // Só um template de nutrição é o caso comum (o padrão semeado) - escolhe
  // ele sozinho pra não obrigar um clique a mais na maioria das clínicas.
  useEffect(() => {
    if (!templateId && templatesNutricao.length > 0) setTemplateId(templatesNutricao[0].id);
  }, [templatesNutricao, templateId]);

  const paciente = useMemo(() => patients.find((p) => p.id === patientId), [patients, patientId]);
  const template = useMemo(() => templatesNutricao.find((tp) => tp.id === templateId), [templatesNutricao, templateId]);

  async function carregarRespostas(pid) {
    setCarregando(true);
    try {
      const todas = await api.scListAnamneseResponses(pid);
      const doTemplate = todas.filter((r) => r.template_id === templateId);
      setRespostas(doTemplate);
      setRespostaAtivaId(doTemplate[0]?.id || null);
    } catch (e) {
      showToast(translateError(e, t));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (patientId && templateId) carregarRespostas(patientId);
    else {
      setRespostas([]);
      setRespostaAtivaId(null);
    }
    // eslint-disable-next-line
  }, [patientId, templateId]);

  const respostaAtiva = respostas.find((r) => r.id === respostaAtivaId) || null;

  async function criarFicha() {
    try {
      const criada = await api.scCreateAnamneseResponse(templateId, patientId);
      setRespostas((r) => [criada, ...r]);
      setRespostaAtivaId(criada.id);
    } catch (e) {
      showToast(translateError(e, t));
    }
  }

  return (
    <div className="sc-cad-secao">
      {erro && <div className="sc-error">{erro}</div>}

      <div className="sc-form">
        <select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
          <option value="">{t("saudeClinicas.anamnese.escolhaPaciente")}</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {templatesNutricao.length > 1 && (
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templatesNutricao.map((tp) => (
              <option key={tp.id} value={tp.id}>{tp.name}</option>
            ))}
          </select>
        )}
      </div>

      {templatesNutricao.length === 0 ? (
        <p className="sc-hint">{t("saudeClinicas.prontuario.semTemplate")}</p>
      ) : !patientId ? (
        <p className="sc-hint">{t("saudeClinicas.prontuario.selecionePaciente")}</p>
      ) : carregando ? (
        <p className="sc-hint">{t("saudeClinicas.prontuario.carregando")}</p>
      ) : (
        <ProntuarioPaciente
          key={patientId + templateId}
          paciente={paciente}
          template={template}
          respostas={respostas}
          respostaAtiva={respostaAtiva}
          onEscolherResposta={setRespostaAtivaId}
          onCriarFicha={criarFicha}
          onAtualizarResposta={(atualizada) =>
            setRespostas((rs) => rs.map((r) => (r.id === atualizada.id ? atualizada : r)))
          }
        />
      )}
    </div>
  );
}

function ProntuarioPaciente({ paciente, template, respostas, respostaAtiva, onEscolherResposta, onCriarFicha, onAtualizarResposta }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [respostasForm, setRespostasForm] = useState(respostaAtiva?.answers || {});
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [linkVisivel, setLinkVisivel] = useState(false);

  useEffect(() => {
    setRespostasForm(respostaAtiva?.answers || {});
    setLinkVisivel(false);
  }, [respostaAtiva?.id]);

  function setResposta(fieldId, valor) {
    setRespostasForm((r) => ({ ...r, [fieldId]: valor }));
  }

  async function salvar() {
    setSalvando(true);
    try {
      const atualizada = await api.scAtualizarAnamneseResposta(respostaAtiva.id, respostasForm);
      onAtualizarResposta(atualizada);
      showToast(t("saudeClinicas.prontuario.respostasSalvas"));
    } catch (e) {
      showToast(translateError(e, t));
    } finally {
      setSalvando(false);
    }
  }

  function linkPublico(resp) {
    return `${window.location.origin}/anamnese/${resp.companyId}/${resp.share_token}`;
  }

  async function enviarPorWhatsapp() {
    setEnviando(true);
    try {
      const enviada = respostaAtiva.share_token ? respostaAtiva : await api.scEnviarAnamneseResponse(respostaAtiva.id);
      onAtualizarResposta(enviada);
      const texto = t("saudeClinicas.anamnese.mensagemWhatsapp", { url: linkPublico(enviada) });
      window.open(whatsappLink(paciente?.phone, texto), "_blank", "noopener,noreferrer");
    } catch (e) {
      showToast(translateError(e, t));
    } finally {
      setEnviando(false);
    }
  }

  async function copiarLink() {
    setEnviando(true);
    try {
      const enviada = respostaAtiva.share_token ? respostaAtiva : await api.scEnviarAnamneseResponse(respostaAtiva.id);
      onAtualizarResposta(enviada);
      const url = linkPublico(enviada);
      try {
        await navigator.clipboard.writeText(url);
        showToast(t("saudeClinicas.prontuario.linkCopiado"));
      } catch {
        // clipboard exige contexto seguro (https) - sem ele, mostra o link
        // pra copiar à mão em vez de falhar calado.
        setLinkVisivel(url);
      }
    } catch (e) {
      showToast(translateError(e, t));
    } finally {
      setEnviando(false);
    }
  }

  if (!template) return <p className="sc-hint">{t("saudeClinicas.prontuario.semTemplate")}</p>;

  if (respostas.length === 0) {
    return (
      <div>
        <p className="sc-hint">{t("saudeClinicas.prontuario.semRespostaAinda", { nome: paciente?.name })}</p>
        <button type="button" className="btn-primary btn-small" onClick={onCriarFicha}>
          {t("saudeClinicas.prontuario.criarFicha")}
        </button>
      </div>
    );
  }

  return (
    <div className="sc-prontuario">
      {respostas.length > 1 && (
        <div className="sc-prontuario-historico">
          {respostas.map((r) => (
            <button
              key={r.id}
              type="button"
              className={"sc-prontuario-historico-item" + (r.id === respostaAtiva.id ? " active" : "")}
              onClick={() => onEscolherResposta(r.id)}
            >
              {new Date(r.created_at).toLocaleDateString()}
              <span className={"sc-badge sc-badge-" + r.status}>{t(`saudeClinicas.anamnese.status.${r.status}`)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sc-prontuario-toolbar">
        <span className={"sc-badge sc-badge-" + respostaAtiva.status}>{t(`saudeClinicas.anamnese.status.${respostaAtiva.status}`)}</span>
        <button type="button" className="btn-secondary btn-small" disabled={enviando} onClick={enviarPorWhatsapp}>
          {respostaAtiva.status === "rascunho" ? t("saudeClinicas.anamnese.novaFichaEnviar") : t("saudeClinicas.anamnese.enviarWhatsapp")}
        </button>
        <button type="button" className="btn-ghost btn-small" disabled={enviando} onClick={copiarLink}>
          {t("saudeClinicas.prontuario.copiarLink")}
        </button>
        <button type="button" className="btn-primary btn-small" disabled={salvando} onClick={salvar}>
          {salvando ? t("saudeClinicas.prontuario.salvando") : t("saudeClinicas.prontuario.salvarRespostas")}
        </button>
        <button type="button" className="btn-ghost btn-small" onClick={onCriarFicha}>
          {t("saudeClinicas.prontuario.novaFicha")}
        </button>
      </div>

      {linkVisivel && (
        <input className="sc-prontuario-link-manual" type="text" readOnly value={linkVisivel} onFocus={(e) => e.target.select()} />
      )}

      <div className="sc-prontuario-campos">
        {template.fields.map((f) =>
          f.type === "section" ? (
            <h3 key={f.id} className="sc-pub-step-title">{f.label}</h3>
          ) : (
            <CampoResposta key={f.id} field={f} valor={respostasForm[f.id]} onChange={(v) => setResposta(f.id, v)} />
          )
        )}
      </div>
    </div>
  );
}

// Mesmo conjunto de tipos de campo do formulário público (AnamnesePublicPage
// CampoPublico), só que sempre editável - aqui é a clínica preenchendo, não
// há readOnly de plano ou de papel de quadro envolvido.
function CampoResposta({ field, valor, onChange }) {
  const label = field.label + (field.required ? " *" : "");
  if (field.type === "boolean") {
    return (
      <label className="sc-pub-campo sc-pub-checkbox">
        <input type="checkbox" checked={!!valor} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    );
  }
  if (field.type === "single_choice") {
    return (
      <div className="sc-pub-campo">
        <span className="sc-pub-label">{label}</span>
        {(field.options || []).map((op) => (
          <label key={op} className="sc-pub-opcao">
            <input type="radio" name={field.id} value={op} checked={valor === op} onChange={() => onChange(op)} />
            {op}
          </label>
        ))}
      </div>
    );
  }
  if (field.type === "multi_choice") {
    const selecionados = Array.isArray(valor) ? valor : [];
    return (
      <div className="sc-pub-campo">
        <span className="sc-pub-label">{label}</span>
        {(field.options || []).map((op) => (
          <label key={op} className="sc-pub-opcao">
            <input
              type="checkbox"
              checked={selecionados.includes(op)}
              onChange={(e) => onChange(e.target.checked ? [...selecionados, op] : selecionados.filter((x) => x !== op))}
            />
            {op}
          </label>
        ))}
      </div>
    );
  }
  if (field.type === "file") {
    return (
      <div className="sc-pub-campo">
        <span className="sc-pub-label">{label}</span>
        <p className="sc-pub-em-breve">Envio de arquivo/exame estará disponível em breve.</p>
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="sc-pub-campo">
        <span className="sc-pub-label">{label}</span>
        <textarea value={valor || ""} onChange={(e) => onChange(e.target.value)} rows={3} />
      </label>
    );
  }
  if (field.type === "date") {
    return (
      <label className="sc-pub-campo">
        <span className="sc-pub-label">{label}</span>
        <input type="date" value={valor || ""} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (field.type === "email") {
    return (
      <label className="sc-pub-campo">
        <span className="sc-pub-label">{label}</span>
        <input type="email" value={valor || ""} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (field.type === "tel") {
    return (
      <label className="sc-pub-campo">
        <span className="sc-pub-label">{label}</span>
        <input type="tel" value={valor || ""} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  return (
    <label className="sc-pub-campo">
      <span className="sc-pub-label">{label}</span>
      <input type="text" value={valor || ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
