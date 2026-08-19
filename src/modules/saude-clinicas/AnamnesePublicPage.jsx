import { useEffect, useState } from "react";
import { scGetAnamnesePublica, scResponderAnamnesePublica } from "../../state/api.js";

// Formulário público de pré-anamnese: o PACIENTE abre isto pelo link de
// WhatsApp, sem login. Fica fora de tudo (sem AuthProvider, sem i18n) - mesmo
// isolamento do painel /admin (ver CLAUDE.md e main.jsx), texto só em
// português por ser ferramenta de uso único e sem seleção de idioma no envio.
// O servidor já devolve `error` em português (não passa por translateError),
// então os erros abaixo mostram err.message direto - mesmo hábito de
// admin/api.js.
export default function AnamnesePublicPage({ companyId, token }) {
  const [estado, setEstado] = useState("carregando"); // carregando | formulario | enviando | obrigado | erro
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [respostas, setRespostas] = useState({});

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

  function setResposta(fieldId, valor) {
    setRespostas((r) => ({ ...r, [fieldId]: valor }));
  }

  async function enviar(e) {
    e.preventDefault();
    // Checagem por "não respondido" (undefined/""), não por falsy: um booleano
    // obrigatório respondido explicitamente como "Não" (false) é uma resposta
    // válida, e !false daria o mesmo resultado de "nunca tocou no campo".
    const faltando = (dados?.fields || []).filter((f) => {
      if (!f.required) return false;
      const v = respostas[f.id];
      return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
    });
    if (faltando.length > 0) {
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
        <h1 className="sc-pub-title">Ficha de anamnese</h1>

        {estado === "carregando" && <p>Carregando...</p>}

        {estado === "erro" && <p className="sc-pub-erro">{erro}</p>}

        {(estado === "formulario" || estado === "enviando") && dados && (
          <form onSubmit={enviar}>
            <p className="sc-pub-sub">
              {dados.patientName ? `Olá, ${dados.patientName}. ` : ""}
              Preencha o formulário abaixo antes da sua consulta.
            </p>
            {erro && <p className="sc-pub-erro">{erro}</p>}
            {dados.fields.map((f) => (
              <CampoPublico key={f.id} field={f} valor={respostas[f.id]} onChange={(v) => setResposta(f.id, v)} />
            ))}
            <button type="submit" className="btn-primary" disabled={estado === "enviando"}>
              {estado === "enviando" ? "Enviando..." : "Enviar respostas"}
            </button>
          </form>
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
  return (
    <label className="sc-pub-campo">
      <span className="sc-pub-label">{label}</span>
      <input type="text" value={valor || ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
