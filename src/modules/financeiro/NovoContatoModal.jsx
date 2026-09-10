import { useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizarDoc, cnpjValido } from "../../utils/doc.js";

function IconContact({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5" />
      <path d="M15.5 4.5h5M15.5 8h5M15.5 11.5h3.2" />
    </svg>
  );
}
function IconInfo({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

const VAZIO = { nome: "", tipo: "fornecedor", doc: "", email: "", telefone: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", pais: "Brasil", pontoReferencia: "" };

// Modal de cadastro/edição de Cliente/Fornecedor (IRES OS): mesmo esqueleto
// visual de NovaCobrancaModal.jsx (header com ícone + título/subtítulo,
// premiumModalIn, CTA escuro), com o formulário de 12+ campos que antes ficava
// sempre exposto na tela agora dividido em duas abas.
export default function NovoContatoModal({ contato, onClose, onSalvar }) {
  const { t } = useTranslation();
  const editando = !!contato;
  const [aba, setAba] = useState("dados");
  const [f, setF] = useState(() =>
    contato
      ? {
          nome: contato.nome, tipo: contato.tipo, doc: contato.doc || "", email: contato.email || "", telefone: contato.telefone || "",
          cep: contato.cep || "", logradouro: contato.logradouro || "", numero: contato.numero || "", complemento: contato.complemento || "",
          bairro: contato.bairro || "", cidade: contato.cidade || "", uf: contato.uf || "", pais: contato.pais || "Brasil",
          pontoReferencia: contato.ponto_referencia || "",
        }
      : VAZIO
  );
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepErro, setCepErro] = useState("");
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [cnpjErro, setCnpjErro] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const rotuloTipo = (tp) => (tp === "ambos" ? t("financeiro.contatos.tipoParceiro") : t(`financeiro.cad.tipo_${tp}`));

  // Busca os dados na BrasilAPI (via servidor) pelo CNPJ e preenche razão social,
  // endereço, telefone e e-mail - mesma lógica que já existia em CadastrosView.
  async function preencherPorCnpj() {
    const doc = normalizarDoc(f.doc);
    setCnpjErro("");
    if (!cnpjValido(doc)) { setCnpjErro(t("financeiro.cad.cnpjInvalido")); return; }
    setBuscandoCnpj(true);
    try {
      const e = await api.buscarCnpj(doc);
      setF((cur) => ({
        ...cur,
        nome: e.nome || cur.nome,
        cep: e.cep || cur.cep,
        logradouro: e.logradouro || cur.logradouro,
        numero: e.numero || cur.numero,
        complemento: e.complemento || cur.complemento,
        bairro: e.bairro || cur.bairro,
        cidade: e.cidade || cur.cidade,
        uf: e.uf || cur.uf,
        telefone: e.telefone || cur.telefone,
        email: e.email || cur.email,
      }));
    } catch (err) {
      setCnpjErro(translateError(err, t));
    } finally {
      setBuscandoCnpj(false);
    }
  }

  // Busca o endereço no ViaCEP (via servidor) - dispara ao completar 8 dígitos e
  // também no blur, para não depender de sair do campo.
  async function preencherPorCep(valorCep) {
    const digs = String(valorCep).replace(/\D/g, "");
    if (digs.length !== 8) return;
    setCepErro(""); setBuscandoCep(true);
    try {
      const e = await api.buscarCep(digs);
      setF((cur) => ({
        ...cur,
        cep: e.cep || cur.cep,
        logradouro: e.logradouro || "",
        bairro: e.bairro || "",
        cidade: e.cidade || "",
        uf: e.uf || "",
        complemento: e.complemento || cur.complemento,
      }));
    } catch (err) {
      setCepErro(translateError(err, t));
    } finally {
      setBuscandoCep(false);
    }
  }

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!f.nome.trim()) { setErro(t("financeiro.cad.nome")); return; }
    setSalvando(true);
    try {
      await onSalvar({ ...f, nome: f.nome.trim() });
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal contato-form-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        <div className="cobr-form-header">
          <span className="cobr-form-header-icon"><IconContact size={20} /></span>
          <div>
            <h2 className="cobr-form-title">{t(editando ? "financeiro.contatos.modal.tituloEditar" : "financeiro.contatos.modal.tituloNovo")}</h2>
            <p className="cobr-form-subtitle">{t("financeiro.contatos.modal.subtitulo")}</p>
          </div>
        </div>

        <form className="cobr-form-body" onSubmit={salvar}>
          <div className="contatos-modal-cnpj">
            <label className="cobr-field">
              <span>{t("financeiro.cad.doc")}</span>
              <input type="text" value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })} />
            </label>
            <button type="button" className="btn-secondary btn-small" onClick={preencherPorCnpj} disabled={buscandoCnpj}>
              {buscandoCnpj ? t("financeiro.cad.buscandoEmpresa") : t("financeiro.contatos.modal.consultarReceita")}
            </button>
          </div>
          {cnpjErro && <p className="cobr-form-erro"><IconInfo /> {cnpjErro}</p>}

          <div className="timing-toggle">
            <button type="button" className={"timing-toggle-btn" + (aba === "dados" ? " active" : "")} onClick={() => setAba("dados")}>
              {t("financeiro.contatos.modal.abaDados")}
            </button>
            <button type="button" className={"timing-toggle-btn" + (aba === "endereco" ? " active" : "")} onClick={() => setAba("endereco")}>
              {t("financeiro.contatos.modal.abaEndereco")}
            </button>
          </div>

          {aba === "dados" ? (
            <>
              <label className="cobr-field">
                <span>{t("financeiro.cad.nome")}</span>
                <input type="text" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
              </label>
              <div className="cobr-form-grid">
                <label className="cobr-field">
                  <span>{t("financeiro.cad.tipo")}</span>
                  <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                    <option value="fornecedor">{rotuloTipo("fornecedor")}</option>
                    <option value="cliente">{rotuloTipo("cliente")}</option>
                    <option value="ambos">{rotuloTipo("ambos")}</option>
                  </select>
                </label>
                <label className="cobr-field">
                  <span>{t("financeiro.cad.email")}</span>
                  <input type="text" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
                </label>
                <label className="cobr-field">
                  <span>{t("financeiro.cad.telefone")}</span>
                  <input type="text" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} />
                </label>
              </div>
            </>
          ) : (
            <>
              <div className="cobr-form-grid">
                <label className="cobr-field">
                  <span>{t("financeiro.cad.cep")}</span>
                  <input
                    type="text" inputMode="numeric" value={f.cep}
                    onChange={(e) => { const v = e.target.value; setF({ ...f, cep: v }); if (v.replace(/\D/g, "").length === 8) preencherPorCep(v); }}
                    onBlur={(e) => preencherPorCep(e.target.value)}
                  />
                </label>
                <label className="cobr-field">
                  <span>{t("financeiro.cad.logradouro")}</span>
                  <input type="text" value={f.logradouro} onChange={(e) => setF({ ...f, logradouro: e.target.value })} />
                </label>
                <label className="cobr-field">
                  <span>{t("financeiro.cad.numero")}</span>
                  <input type="text" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} />
                </label>
                <label className="cobr-field">
                  <span>{t("financeiro.cad.complemento")}</span>
                  <input type="text" value={f.complemento} onChange={(e) => setF({ ...f, complemento: e.target.value })} />
                </label>
                <label className="cobr-field">
                  <span>{t("financeiro.cad.bairro")}</span>
                  <input type="text" value={f.bairro} onChange={(e) => setF({ ...f, bairro: e.target.value })} />
                </label>
                <label className="cobr-field">
                  <span>{t("financeiro.cad.cidade")}</span>
                  <input type="text" value={f.cidade} onChange={(e) => setF({ ...f, cidade: e.target.value })} />
                </label>
                <label className="cobr-field">
                  <span>{t("financeiro.cad.uf")}</span>
                  <input type="text" maxLength={2} value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value.toUpperCase() })} />
                </label>
                <label className="cobr-field">
                  <span>{t("financeiro.cad.pais")}</span>
                  <input type="text" value={f.pais} onChange={(e) => setF({ ...f, pais: e.target.value })} />
                </label>
              </div>
              <label className="cobr-field">
                <span>{t("financeiro.cad.pontoReferencia")}</span>
                <input type="text" value={f.pontoReferencia} onChange={(e) => setF({ ...f, pontoReferencia: e.target.value })} />
              </label>
              {buscandoCep && <p className="cobr-form-subtitle">{t("financeiro.cad.buscandoCep")}</p>}
              {cepErro && <p className="cobr-form-erro"><IconInfo /> {cepErro}</p>}
            </>
          )}

          {erro && <p className="cobr-form-erro"><IconInfo /> {erro}</p>}

          <div className="cobr-form-footer">
            <button type="button" className="recurrence-btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="recurrence-btn-primary" disabled={salvando}>
              {salvando ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
