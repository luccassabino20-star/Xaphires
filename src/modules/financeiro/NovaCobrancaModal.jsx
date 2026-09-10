import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import { reaisParaCents } from "./dinheiro.js";
import * as api from "../../state/api.js";
import SearchSelect from "./SearchSelect.jsx";

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const METODOS = ["pix", "boleto", "card"];

// gatewayProvider decide se o campo de número de cartão aparece: só o
// simulado mostra (mesma regra do checkout de assinatura em CheckoutModal.jsx)
// - nenhum provedor real recebe número de cartão do nosso servidor, cartão de
// verdade é sempre um link de checkout hospedado.
export default function NovaCobrancaModal({ contatos, gatewayProvider, onClose, onCreated }) {
  const { t } = useTranslation();
  const showToast = useToast();

  const [recorrente, setRecorrente] = useState(false);
  const [contatoId, setContatoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [due, setDue] = useState(hojeCivil());
  const [intervaloMeses, setIntervaloMeses] = useState(1);
  const [metodo, setMetodo] = useState("pix");
  const [cardNumber, setCardNumber] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const opcoesContato = contatos.map((c) => ({ id: c.id, label: c.nome }));

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    const valorCents = reaisParaCents(valor);
    if (!contatoId) return setErro(t("financeiro.cobrancas.form.erroCliente"));
    if (!valorCents) return setErro(t("financeiro.cobrancas.form.erroValor"));
    setSalvando(true);
    try {
      if (recorrente) {
        await api.finCreateRecorrencia({ contatoId, descricao, valorCents, metodo, intervaloMeses: Number(intervaloMeses), primeiraEmissao: due });
      } else {
        await api.finCreateCobranca({ contatoId, descricao, valorCents, due, metodo, cardNumber: gatewayProvider === "fake" ? cardNumber : undefined });
      }
      showToast(t(recorrente ? "financeiro.cobrancas.form.recorrenciaCriada" : "financeiro.cobrancas.form.cobrancaCriada"));
      onCreated();
      onClose();
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
        <div className="modal-header">
          <h2 className="members-modal-title">{t("financeiro.cobrancas.form.titulo")}</h2>
        </div>

        <form className="fin-modal-body" onSubmit={salvar}>
          <div className="timing-toggle">
            <button type="button" className={"timing-toggle-btn" + (!recorrente ? " active" : "")} onClick={() => setRecorrente(false)}>
              {t("financeiro.cobrancas.form.unica")}
            </button>
            <button type="button" className={"timing-toggle-btn" + (recorrente ? " active" : "")} onClick={() => setRecorrente(true)}>
              {t("financeiro.cobrancas.form.recorrente")}
            </button>
          </div>

          <label className="auth-field">
            <span>{t("financeiro.cobrancas.form.cliente")}</span>
            <SearchSelect value={contatoId} onChange={setContatoId} options={opcoesContato} placeholder={t("financeiro.cobrancas.form.clientePlaceholder")} />
          </label>

          <label className="auth-field">
            <span>{t("financeiro.cobrancas.form.descricao")}</span>
            <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} />
          </label>

          <div className="fin-modal-grid">
            <label className="auth-field">
              <span>{t("financeiro.cobrancas.form.valor")}</span>
              <input type="text" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
            </label>
            <label className="auth-field">
              <span>{t(recorrente ? "financeiro.cobrancas.form.primeiraEmissao" : "financeiro.cobrancas.form.vencimento")}</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
            {recorrente && (
              <label className="auth-field">
                <span>{t("financeiro.cobrancas.form.intervalo")}</span>
                <input type="number" min="1" max="12" value={intervaloMeses} onChange={(e) => setIntervaloMeses(e.target.value)} />
              </label>
            )}
          </div>

          <label className="auth-field">
            <span>{t("financeiro.cobrancas.form.metodo")}</span>
            <div className="timing-toggle">
              {METODOS.map((m) => (
                <button key={m} type="button" className={"timing-toggle-btn" + (metodo === m ? " active" : "")} onClick={() => setMetodo(m)}>
                  {t(`financeiro.cobrancas.metodo.${m}`)}
                </button>
              ))}
            </div>
          </label>

          {metodo === "card" && gatewayProvider === "fake" && !recorrente && (
            <label className="auth-field">
              <span>{t("financeiro.cobrancas.form.cardNumberSimulado")}</span>
              <input type="text" inputMode="numeric" placeholder="0000 0000 0000 0000" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
            </label>
          )}

          {erro && <div className="auth-error">{erro}</div>}

          <div className="fin-modal-acoes">
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? t("common.loading") : t("financeiro.cobrancas.form.emitir")}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>{t("common.cancel")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
