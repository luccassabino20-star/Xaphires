import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents, reaisParaCents, centsOuZero } from "./dinheiro.js";
import { comCodigo } from "./rotulo.js";
import { FORMAS } from "./LancamentoModal.jsx";
import SearchSelect from "./SearchSelect.jsx";

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formVazio(tipoInicial) {
  return {
    tipo: tipoInicial || "receber", descricao: "", doc: "", emissao: hojeCivil(), due: hojeCivil(), formaPagto: "",
    categoryId: "", centroCustoId: "", contatoId: "",
    valor: "", desconto: "", retencao: "", multa: "", juros: "", observacao: "",
  };
}

// Modal Ultra-Premium do botão "+ Novo Título" da tela Títulos - mesmo
// formulário de LancamentosView.jsx (que continua existindo à parte, na aba
// Lançamentos, fora do escopo desta reformulação), só embrulhado em modal.
// Impostos e parcelas não cabem aqui: dependem do título já ter id, então
// TitulosView abre LancamentoModal no título recém-criado (onCreated(id)).
export default function NovoTituloModal({ categorias, centros, contatos, tipoInicial, onClose, onCreated }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();

  const [form, setForm] = useState(() => formVazio(tipoInicial));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const liquido = useMemo(() => {
    const bruto = reaisParaCents(form.valor) || 0;
    const liq = bruto - centsOuZero(form.desconto) - centsOuZero(form.retencao) + centsOuZero(form.multa) + centsOuZero(form.juros);
    return Math.max(0, liq);
  }, [form.valor, form.desconto, form.retencao, form.multa, form.juros]);

  const contatoOpts = useMemo(() => contatos.map((c) => ({ id: c.id, label: c.nome })), [contatos]);
  const categoriaOpts = useMemo(() => categorias.map((c) => ({ id: c.id, label: comCodigo(c) })), [categorias]);
  const centroOpts = useMemo(
    () => centros.filter((c) => c.tipo !== "sintetico" && c.ativo === 1).map((c) => ({ id: c.id, label: comCodigo(c) })),
    [centros]
  );

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    const valorCents = reaisParaCents(form.valor);
    if (!valorCents) return setErro(t("financeiro.form.valorInvalido"));
    if (!form.due) return setErro(t("financeiro.form.dataObrigatoria"));
    setEnviando(true);
    try {
      const criado = await api.finCreateLancamento({
        tipo: form.tipo, descricao: form.descricao.trim(), doc: form.doc.trim(), valorCents, due: form.due,
        emissao: form.emissao || null, formaPagto: form.formaPagto, observacao: form.observacao,
        descontoCents: centsOuZero(form.desconto), retencaoCents: centsOuZero(form.retencao),
        multaCents: centsOuZero(form.multa), jurosCents: centsOuZero(form.juros),
        categoryId: form.categoryId || undefined, centroCustoId: form.centroCustoId || undefined,
        contatoId: form.contatoId || undefined,
      });
      showToast(t("financeiro.toast.criado"));
      onCreated(criado.id);
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-wide">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        <form onSubmit={salvar}>
          <div className="fin-novo-head">
            <h3>{t("financeiro.form.novoTitulo")}</h3>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="receber">{t("financeiro.tipo.receber")}</option>
              <option value="pagar">{t("financeiro.tipo.pagar")}</option>
            </select>
          </div>

          <label className="fin-field fin-novo-correntista">
            <span>{t("financeiro.col.contraparte")}</span>
            <SearchSelect value={form.contatoId} onChange={(id) => setForm({ ...form, contatoId: id })} options={contatoOpts} allLabel={t("financeiro.form.semContato")} />
          </label>

          <fieldset className="fin-bloco">
            <legend>{t("financeiro.tit.identificacao")}</legend>
            <div className="fin-modal-grid">
              <label className="fin-field fin-field-wide">
                <span>{t("financeiro.col.descricao")}</span>
                <input type="text" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.docNumero")}</span>
                <input type="text" value={form.doc} onChange={(e) => setForm({ ...form, doc: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.emissao")}</span>
                <input type="date" value={form.emissao} onChange={(e) => setForm({ ...form, emissao: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.col.vencimento")}</span>
                <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.formaPagto")}</span>
                <select value={form.formaPagto} onChange={(e) => setForm({ ...form, formaPagto: e.target.value })}>
                  <option value="">{t("financeiro.tit.semForma")}</option>
                  {FORMAS.map((k) => <option key={k} value={k}>{t("financeiro.forma." + k)}</option>)}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="fin-bloco">
            <legend>{t("financeiro.tit.apropriacao")}</legend>
            <div className="fin-modal-grid">
              <label className="fin-field">
                <span>{t("financeiro.cad.classes")}</span>
                <SearchSelect value={form.categoryId} onChange={(id) => setForm({ ...form, categoryId: id })} options={categoriaOpts} allLabel={t("financeiro.form.semClasse")} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.cad.centros")}</span>
                <SearchSelect value={form.centroCustoId} onChange={(id) => setForm({ ...form, centroCustoId: id })} options={centroOpts} allLabel={t("financeiro.form.semCentro")} />
              </label>
            </div>
          </fieldset>

          <fieldset className="fin-bloco">
            <legend>{t("financeiro.tit.valores")}</legend>
            <div className="fin-modal-grid">
              <label className="fin-field">
                <span>{t("financeiro.tit.valorTitulo")}</span>
                <input type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.desconto")}</span>
                <input type="number" step="0.01" min="0" value={form.desconto} placeholder="0,00" onChange={(e) => setForm({ ...form, desconto: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.retencao")}</span>
                <input type="number" step="0.01" min="0" value={form.retencao} placeholder="0,00" onChange={(e) => setForm({ ...form, retencao: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.multa")}</span>
                <input type="number" step="0.01" min="0" value={form.multa} placeholder="0,00" onChange={(e) => setForm({ ...form, multa: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.juros")}</span>
                <input type="number" step="0.01" min="0" value={form.juros} placeholder="0,00" onChange={(e) => setForm({ ...form, juros: e.target.value })} />
              </label>
              <div className="fin-field fin-tit-liquido">
                <span>{t("financeiro.tit.valorLiquido")}</span>
                <strong>{formatCents(liquido, lang)}</strong>
              </div>
            </div>
          </fieldset>

          <label className="fin-field">
            <span>{t("financeiro.tit.observacao")}</span>
            <textarea rows={2} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          </label>

          {erro && <div className="fin-error">{erro}</div>}

          <div className="fin-modal-acoes">
            <button type="submit" className="btn-primary btn-small" disabled={enviando}>{t("financeiro.form.adicionar")}</button>
            <span className="fin-cad-hint">{t("financeiro.form.impostoAposCriar")}</span>
          </div>
        </form>
      </div>
    </div>
  );
}
