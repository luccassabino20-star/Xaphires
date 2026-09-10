import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents, reaisParaCents } from "./dinheiro.js";
import * as api from "../../state/api.js";
import SearchSelect from "./SearchSelect.jsx";

// Mesmo molde de ícone do resto do app (viewBox 24x24, stroke fino) - ver
// ArchiveModal.jsx/RecurrencesModal.jsx. Sem lib nova só para os traços daqui.
function IconReceipt({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v18l-2.5-1.7L13 21l-1-1.7-1 1.7-2.5-1.7L6 21z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}
function IconRepeat({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
function IconBolt({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M13 2 3 14h7l-1 8 11-14h-8z" />
    </svg>
  );
}
function IconBarcode({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 5v14M8 5v14M11 5v14M13 5v14M17 5v14M20 5v14" />
    </svg>
  );
}
function IconCard({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19" />
      <path d="M6 15h4" />
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

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const METODOS = [
  { id: "pix", Icon: IconBolt },
  { id: "boleto", Icon: IconBarcode },
  { id: "card", Icon: IconCard },
];

function formatDueBR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// gatewayProvider decide se o campo de número de cartão aparece: só o
// simulado mostra (mesma regra do checkout de assinatura em CheckoutModal.jsx)
// - nenhum provedor real recebe número de cartão do nosso servidor, cartão de
// verdade é sempre um link de checkout hospedado.
export default function NovaCobrancaModal({ contatos, gatewayProvider, contatoIdInicial, descricaoInicial, valorInicial, onClose, onCreated }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();

  const [recorrente, setRecorrente] = useState(false);
  const [contatoId, setContatoId] = useState(() => contatoIdInicial || "");
  const [descricao, setDescricao] = useState(() => descricaoInicial || "");
  const [valor, setValor] = useState(() => valorInicial || "");
  const [due, setDue] = useState(hojeCivil());
  const [intervaloMeses, setIntervaloMeses] = useState(1);
  const [metodo, setMetodo] = useState("pix");
  const [cardNumber, setCardNumber] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const opcoesContato = contatos.map((c) => ({ id: c.id, label: c.nome }));
  const contatoEscolhido = contatos.find((c) => c.id === contatoId);
  const valorCentsPreview = reaisParaCents(valor);

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
      <div className="modal cobr-form-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        <div className="cobr-form-header">
          <span className="cobr-form-header-icon">
            <IconReceipt size={20} />
          </span>
          <div>
            <h2 className="cobr-form-title">{t("financeiro.cobrancas.form.titulo")}</h2>
            <p className="cobr-form-subtitle">{t("financeiro.cobrancas.form.subtitulo")}</p>
          </div>
        </div>

        <form className="cobr-form-body" onSubmit={salvar}>
          <div className="timing-toggle cobr-tipo-toggle">
            <button type="button" className={"timing-toggle-btn" + (!recorrente ? " active" : "")} onClick={() => setRecorrente(false)}>
              <IconReceipt size={14} /> {t("financeiro.cobrancas.form.unica")}
            </button>
            <button type="button" className={"timing-toggle-btn" + (recorrente ? " active" : "")} onClick={() => setRecorrente(true)}>
              <IconRepeat size={14} /> {t("financeiro.cobrancas.form.recorrente")}
            </button>
          </div>

          <label className="cobr-field">
            <span>{t("financeiro.cobrancas.form.cliente")}</span>
            <SearchSelect value={contatoId} onChange={setContatoId} options={opcoesContato} placeholder={t("financeiro.cobrancas.form.clientePlaceholder")} />
          </label>

          <label className="cobr-field">
            <span>{t("financeiro.cobrancas.form.descricao")}</span>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={200}
              placeholder={t("financeiro.cobrancas.form.descricaoPlaceholder")}
            />
          </label>

          <div className="cobr-form-grid">
            <label className="cobr-field">
              <span>{t("financeiro.cobrancas.form.valor")}</span>
              <span className="cobr-valor-wrap">
                <span className="cobr-valor-prefixo">R$</span>
                <input type="text" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
              </span>
            </label>
            <label className="cobr-field">
              <span>{t(recorrente ? "financeiro.cobrancas.form.primeiraEmissao" : "financeiro.cobrancas.form.vencimento")}</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
            {recorrente && (
              <label className="cobr-field">
                <span>{t("financeiro.cobrancas.form.intervalo")}</span>
                <input type="number" min="1" max="12" value={intervaloMeses} onChange={(e) => setIntervaloMeses(e.target.value)} />
              </label>
            )}
          </div>

          <div className="cobr-field">
            <span>{t("financeiro.cobrancas.form.metodo")}</span>
            <div className="cobr-metodo-picker">
              {METODOS.map(({ id, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={"cobr-metodo-card cobr-metodo-card-" + id + (metodo === id ? " selected" : "")}
                  onClick={() => setMetodo(id)}
                  aria-pressed={metodo === id}
                >
                  <span className="cobr-metodo-card-icon">
                    <Icon />
                  </span>
                  {t(`financeiro.cobrancas.metodo.${id}`)}
                </button>
              ))}
            </div>
          </div>

          {metodo === "card" && gatewayProvider === "fake" && !recorrente && (
            <label className="cobr-field">
              <span>{t("financeiro.cobrancas.form.cardNumberSimulado")}</span>
              <input type="text" inputMode="numeric" placeholder="0000 0000 0000 0000" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
            </label>
          )}

          {contatoEscolhido && !!valorCentsPreview && (
            <div className="cobr-resumo">
              <span className="cobr-resumo-linha">
                <span className="cobr-resumo-label">{t("financeiro.cobrancas.form.resumoCliente")}</span>
                <span className="cobr-resumo-valor">{contatoEscolhido.nome}</span>
              </span>
              <span className="cobr-resumo-linha">
                <span className="cobr-resumo-label">{t(recorrente ? "financeiro.cobrancas.form.resumoPrimeira" : "financeiro.cobrancas.form.resumoVencimento")}</span>
                <span className="cobr-resumo-valor">{formatDueBR(due)}</span>
              </span>
              <span className="cobr-resumo-linha cobr-resumo-total">
                <span className="cobr-resumo-label">{t("financeiro.cobrancas.form.resumoTotal")}</span>
                <span className="cobr-resumo-total-valor">{formatCents(valorCentsPreview, lang)}</span>
              </span>
            </div>
          )}

          {erro && (
            <p className="cobr-form-erro">
              <IconInfo /> {erro}
            </p>
          )}

          <div className="cobr-form-footer">
            <button type="button" className="recurrence-btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="recurrence-btn-primary" disabled={salvando}>
              {salvando ? t("common.loading") : t("financeiro.cobrancas.form.emitir")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
