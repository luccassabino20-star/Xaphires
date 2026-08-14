import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents, reaisParaCents, centsOuZero } from "./dinheiro.js";
import { comCodigo } from "./rotulo.js";
import LancamentoModal, { FORMAS } from "./LancamentoModal.jsx";
import SearchSelect from "./SearchSelect.jsx";

// Data civil de HOJE no horário LOCAL, não UTC: toISOString() daria o dia de UTC
// e, perto da meia-noite no Brasil (UTC-3), pré-preencheria vencimento/emissão um
// dia à frente. Mesma escolha do resto do módulo (hojeCivil).
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function formVazio() {
  return {
    tipo: "receber", descricao: "", doc: "", emissao: hoje(), due: hoje(), formaPagto: "",
    categoryId: "", centroCustoId: "", contatoId: "",
    valor: "", desconto: "", retencao: "", multa: "", juros: "", observacao: "",
  };
}

// Aba Lançamentos: o ato de lançar um título novo, com TODOS os campos que o
// detalhe do título tem (identificação, apropriação, valores com juros/multa/
// desconto/retenção e o líquido ao vivo). Impostos e parcelas não cabem aqui: os
// dois geram títulos vinculados e precisam do título já salvo (id/número), então
// são adicionados logo depois - por isso, ao criar, o título recém-nascido abre
// no detalhe, onde se aplica imposto e se desdobra.
export default function LancamentosView() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();

  const [categorias, setCategorias] = useState([]);
  const [centros, setCentros] = useState([]);
  const [contatos, setContatos] = useState([]);
  const [contas, setContas] = useState([]);
  const [impostosCadastro, setImpostosCadastro] = useState([]);
  const [lancamentos, setLancamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(formVazio());
  const [enviando, setEnviando] = useState(false);
  const [formErro, setFormErro] = useState("");
  const [detalheId, setDetalheId] = useState(null);

  async function carregar() {
    try {
      const [cats, ccs, cts, cos, imps, lancs] = await Promise.all([
        api.finListCategorias(lang), api.finListCentrosCusto(), api.finListContatos(),
        api.finListContas(), api.finListImpostos(), api.finListLancamentos(),
      ]);
      setCategorias(cats); setCentros(ccs); setContatos(cts); setContas(cos); setImpostosCadastro(imps); setLancamentos(lancs);
      setErro("");
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  // Líquido ao vivo, igual ao do detalhe (só que sem impostos, que ainda não
  // existem num título que não nasceu): valor - desconto - retenção + multa + juros.
  const liquido = useMemo(() => {
    const bruto = reaisParaCents(form.valor) || 0;
    const liq = bruto - centsOuZero(form.desconto) - centsOuZero(form.retencao) + centsOuZero(form.multa) + centsOuZero(form.juros);
    return Math.max(0, liq);
  }, [form.valor, form.desconto, form.retencao, form.multa, form.juros]);

  async function submitNovo(e) {
    e.preventDefault();
    setFormErro("");
    const valorCents = reaisParaCents(form.valor);
    if (!valorCents) return setFormErro(t("financeiro.form.valorInvalido"));
    if (!form.due) return setFormErro(t("financeiro.form.dataObrigatoria"));
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
      setForm(formVazio());
      showToast(t("financeiro.toast.criado"));
      // Recarrega e abre o título criado, para aplicar imposto/desdobrar já.
      await carregar();
      setDetalheId(criado.id);
    } catch (err) {
      setFormErro(translateError(err, t));
    } finally {
      setEnviando(false);
    }
  }

  // Opções {id,label} dos selects pesquisáveis. Classe/centro levam o código
  // junto (comCodigo); contato é só o nome.
  const contatoOpts = useMemo(() => contatos.map((c) => ({ id: c.id, label: c.nome })), [contatos]);
  const categoriaOpts = useMemo(() => categorias.map((c) => ({ id: c.id, label: comCodigo(c) })), [categorias]);
  // Só analítico ativo recebe lançamento (sintético é nó de agrupamento na árvore).
  const centroOpts = useMemo(
    () => centros.filter((c) => c.tipo !== "sintetico" && c.ativo === 1).map((c) => ({ id: c.id, label: comCodigo(c) })),
    [centros]
  );

  const detalhe = detalheId ? lancamentos.find((l) => l.id === detalheId) : null;

  if (carregando) return <div className="fin-loading">{t("common.loading")}</div>;
  if (erro) return <div className="fin-error">{erro}</div>;

  return (
    <div className="fin-novo-titulo">
      <form onSubmit={submitNovo}>
        <div className="fin-novo-head">
          <h3>{t("financeiro.form.novoTitulo")}</h3>
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="receber">{t("financeiro.tipo.receber")}</option>
            <option value="pagar">{t("financeiro.tipo.pagar")}</option>
          </select>
        </div>

        {/* Cliente/Fornecedor no topo, acima da identificação - é a primeira
            coisa que se define ao lançar, como no cabeçalho do detalhe. */}
        <label className="fin-field fin-novo-correntista">
          <span>{t("financeiro.col.contraparte")}</span>
          <SearchSelect
            value={form.contatoId}
            onChange={(id) => setForm({ ...form, contatoId: id })}
            options={contatoOpts}
            allLabel={t("financeiro.form.semContato")}
          />
        </label>

        {/* Identificação / Documento */}
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

        {/* Apropriação: classe, centro de custo e contraparte */}
        <fieldset className="fin-bloco">
          <legend>{t("financeiro.tit.apropriacao")}</legend>
          <div className="fin-modal-grid">
            <label className="fin-field">
              <span>{t("financeiro.cad.classes")}</span>
              <SearchSelect
                value={form.categoryId}
                onChange={(id) => setForm({ ...form, categoryId: id })}
                options={categoriaOpts}
                allLabel={t("financeiro.form.semClasse")}
              />
            </label>
            <label className="fin-field">
              <span>{t("financeiro.cad.centros")}</span>
              <SearchSelect
                value={form.centroCustoId}
                onChange={(id) => setForm({ ...form, centroCustoId: id })}
                options={centroOpts}
                allLabel={t("financeiro.form.semCentro")}
              />
            </label>
          </div>
        </fieldset>

        {/* Valores */}
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

        {formErro && <div className="fin-error">{formErro}</div>}

        <div className="fin-novo-acoes">
          <button type="submit" className="btn-primary btn-small" disabled={enviando}>{t("financeiro.form.adicionar")}</button>
          <span className="fin-cad-hint">{t("financeiro.form.impostoAposCriar")}</span>
        </div>
      </form>

      {detalhe && (
        <LancamentoModal
          lancamento={detalhe}
          categorias={categorias}
          centros={centros}
          contatos={contatos}
          contas={contas}
          impostosCadastro={impostosCadastro}
          todos={lancamentos}
          onClose={() => setDetalheId(null)}
          onChanged={() => { setDetalheId(null); carregar(); }}
          onRefreshList={carregar}
        />
      )}
    </div>
  );
}
