import { useEffect, useMemo, useState } from "react";
import { scGetAnamnesePublica, scResponderAnamnesePublica } from "../../state/api.js";

// Formulário público de pré-anamnese: o PACIENTE abre isto pelo link de
// WhatsApp, sem login. Fica fora de tudo (sem AuthProvider, sem i18n) - mesmo
// isolamento do painel /admin (ver CLAUDE.md e main.jsx), texto só em
// português por ser ferramenta de uso único e sem seleção de idioma no envio.
// O servidor já devolve `error` em português (não passa por translateError),
// então os erros abaixo mostram err.message direto - mesmo hábito de
// admin/api.js.
//
// O campo tipo "section" não é uma pergunta - é só um título, e marca onde
// uma etapa termina e a próxima começa (agruparEmEtapas). Um template sem
// nenhuma "section" (todo template criado antes desta função existir) cai
// numa etapa única com todas as perguntas juntas: o comportamento de antes,
// sem quebrar nada que já estava enviado por aí.
function agruparEmEtapas(fields) {
  const etapas = [];
  let atual = { titulo: null, fields: [] };
  for (const f of fields) {
    if (f.type === "section") {
      if (atual.titulo !== null || atual.fields.length > 0) etapas.push(atual);
      atual = { titulo: f.label, fields: [] };
    } else {
      atual.fields.push(f);
    }
  }
  etapas.push(atual);
  return etapas;
}

export default function AnamnesePublicPage({ companyId, token }) {
  const [estado, setEstado] = useState("carregando"); // carregando | formulario | enviando | obrigado | erro
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [respostas, setRespostas] = useState({});
  const [etapaAtual, setEtapaAtual] = useState(0);

  useEffect(() => {
    scGetAnamnesePublica(companyId, token)
      .then((d) => {
        setDados(d);
        setEstado("formulario");
      })
      .catch((e) => {
        setErro(e.message || "Não foi possível abrir este link.");
        setEstado("erro");
      });
  }, [companyId, token]);

  const etapas = useMemo(() => agruparEmEtapas(dados?.fields || []), [dados]);
  const ultimaEtapa = etapaAtual === etapas.length - 1;

  function setResposta(fieldId, valor) {
    setRespostas((r) => ({ ...r, [fieldId]: valor }));
  }

  // Checagem por "não respondido" (undefined/""), não por falsy: um booleano
  // obrigatório respondido explicitamente como "Não" (false) é uma resposta
  // válida, e !false daria o mesmo resultado de "nunca tocou no campo".
  function faltandoEm(campos) {
    return campos.filter((f) => {
      if (!f.required) return false;
      const v = respostas[f.id];
      return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
    });
  }

  function irParaTopo() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function avancar(e) {
    e.preventDefault();
    if (faltandoEm(etapas[etapaAtual].fields).length > 0) {
      setErro("Responda todas as perguntas obrigatórias antes de continuar.");
      return;
    }
    setErro("");
    setEtapaAtual((i) => i + 1);
    irParaTopo();
  }

  function voltar() {
    setErro("");
    setEtapaAtual((i) => Math.max(0, i - 1));
    irParaTopo();
  }

  async function enviar(e) {
    e.preventDefault();
    if (faltandoEm(etapas[etapaAtual].fields).length > 0) {
      setErro("Responda todas as perguntas obrigatórias antes de enviar.");
      return;
    }
    setEstado("enviando");
    try {
      await scResponderAnamnesePublica(companyId, token, respostas);
      setEstado("obrigado");
    } catch (e) {
      setErro(e.message || "Não foi possível enviar suas respostas. Tente novamente.");
      setEstado("formulario");
    }
  }

  return (
    <div className="sc-pub">
      <div className="sc-pub-card">
        <h1 className="sc-pub-title">{dados?.templateName || "Ficha de anamnese"}</h1>

        {estado === "carregando" && <p>Carregando...</p>}

        {estado === "erro" && <p className="sc-pub-erro">{erro}</p>}

        {(estado === "formulario" || estado === "enviando") && dados && (
          <>
            {etapaAtual === 0 && (
              <p className="sc-pub-sub">
                {dados.patientName ? `Olá, ${dados.patientName}. ` : ""}
                {dados.description || "Preencha o formulário abaixo antes da sua consulta."}
              </p>
            )}

            {etapas.length > 1 && (
              <div className="sc-pub-progress">
                <div className="sc-pub-progress-bar">
                  <div className="sc-pub-progress-fill" style={{ width: `${((etapaAtual + 1) / etapas.length) * 100}%` }} />
                </div>
                <span className="sc-pub-progress-label">Etapa {etapaAtual + 1} de {etapas.length}</span>
              </div>
            )}

            {etapas[etapaAtual].titulo && <h2 className="sc-pub-step-title">{etapas[etapaAtual].titulo}</h2>}

            {erro && <p className="sc-pub-erro">{erro}</p>}

            <form onSubmit={ultimaEtapa ? enviar : avancar}>
              {etapas[etapaAtual].fields.map((f) => (
                <CampoPublico key={f.id} field={f} valor={respostas[f.id]} onChange={(v) => setResposta(f.id, v)} />
              ))}

              <div className="sc-pub-nav">
                {etapaAtual > 0 && (
                  <button type="button" className="btn-secondary" onClick={voltar} disabled={estado === "enviando"}>
                    Voltar
                  </button>
                )}
                <button type="submit" className="btn-primary" disabled={estado === "enviando"}>
                  {ultimaEtapa ? (estado === "enviando" ? "Enviando..." : "Enviar respostas") : "Avançar"}
                </button>
              </div>
            </form>
          </>
        )}

        {estado === "obrigado" && (
          <p className="sc-pub-obrigado">Respostas enviadas. Obrigado! Pode fechar esta página.</p>
        )}
      </div>
    </div>
  );
}

function CampoPublico({ field, valor, onChange }) {
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
        <p className="sc-pub-em-breve">Envio de arquivo/exame estará disponível em breve. Traga este documento na consulta.</p>
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
  // date/email/tel só trocam o teclado e o tipo de input do celular - o valor
  // continua sendo string simples, igual devido do cartão do Kanban (ver
  // CLAUDE.md: <input type="date"> já produz AAAA-MM-DD sozinho).
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
        <input type="email" inputMode="email" autoCapitalize="off" value={valor || ""} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (field.type === "tel") {
    return (
      <label className="sc-pub-campo">
        <span className="sc-pub-label">{label}</span>
        <input type="tel" inputMode="tel" value={valor || ""} onChange={(e) => onChange(e.target.value)} />
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
