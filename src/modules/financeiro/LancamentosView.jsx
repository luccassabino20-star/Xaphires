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
import AnexosLancamento from "./AnexosLancamento.jsx";

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
    categoryId: "", centroCustoId: "", contatoId: "", contaId: "",
    valor: "", desconto: "", retencao: "", multa: "", juros: "", observacao: "",
  };
}

// Aba Lançamentos: central de criação de título Ultra-Premium (Stripe
// Invoicing/Brex-like) - blocos separados (entidade, apropriação, valores,
// parcelamento, anexos) em vez do formulário corrido de antes. Impostos não
// cabem aqui (dependem do título já ter id) - por isso, ao criar sem "Emitir
// Boleto/Pix", o título recém-nascido abre no detalhe, onde se aplica
// imposto e ainda se desdobra mais (parcelamento já pode nascer aqui, no
// Bloco 4).
export default function LancamentosView({ onGerarCobranca }) {
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
  const [salvando, setSalvando] = useState(false);
  const [formErro, setFormErro] = useState("");
  const [detalheId, setDetalheId] = useState(null);

  const [parcelarAtivo, setParcelarAtivo] = useState(false);
  const [nParcelas, setNParcelas] = useState(2);
  const [periodicidade, setPeriodicidade] = useState("1");
  const [anexosPendentes, setAnexosPendentes] = useState([]);

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

  // Parcelamento (Bloco 4) espera o título limpo de encargos - mesma regra
  // `!temEncargo` já aplicada ao desdobrar pós-criação em LancamentoModal.jsx,
  // só que checada ANTES de existir o título, direto nos campos do form.
  const temEncargo = !!(centsOuZero(form.desconto) || centsOuZero(form.retencao) || centsOuZero(form.multa) || centsOuZero(form.juros));
  const podeParcelar = !temEncargo;
  useEffect(() => { if (!podeParcelar) setParcelarAtivo(false); }, [podeParcelar]);

  const podeEmitirBoleto = form.tipo === "receber" && !!form.contatoId;

  async function salvar(statusAlvo, emitirBoleto) {
    setFormErro("");
    const valorCents = reaisParaCents(form.valor);
    if (!valorCents) return setFormErro(t("financeiro.form.valorInvalido"));
    if (!form.due) return setFormErro(t("financeiro.form.dataObrigatoria"));
    setSalvando(true);
    try {
      const criado = await api.finCreateLancamento({
        tipo: form.tipo, descricao: form.descricao.trim(), doc: form.doc.trim(), valorCents, due: form.due,
        emissao: form.emissao || null, formaPagto: form.formaPagto, observacao: form.observacao,
        descontoCents: centsOuZero(form.desconto), retencaoCents: centsOuZero(form.retencao),
        multaCents: centsOuZero(form.multa), jurosCents: centsOuZero(form.juros),
        categoryId: form.categoryId || undefined, centroCustoId: form.centroCustoId || undefined,
        contatoId: form.contatoId || undefined, contaId: form.contaId || undefined,
        status: statusAlvo,
      });
      if (parcelarAtivo && podeParcelar && Number(nParcelas) > 1) {
        await api.finDesdobrarLancamento(criado.id, { parcelas: Number(nParcelas), intervaloMeses: Number(periodicidade) });
      }
      for (const file of anexosPendentes) {
        await api.finAddAttachment(criado.id, file);
      }
      showToast(t(statusAlvo === "provisionado" ? "financeiro.lanc.toastRascunho" : "financeiro.toast.criado"));
      const prefill = { contatoId: form.contatoId, descricao: form.descricao.trim(), valorInicial: form.valor };
      setForm(formVazio());
      setParcelarAtivo(false);
      setAnexosPendentes([]);
      await carregar();
      if (emitirBoleto) onGerarCobranca?.(prefill);
      else setDetalheId(criado.id);
    } catch (err) {
      setFormErro(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  // Opções {id,label} dos selects pesquisáveis. Contato ganha sublabel (doc) -
  // o SearchSelect desenha avatar de iniciais + CPF/CNPJ embaixo do nome, e a
  // busca passa a casar pelo documento também. Classe ganha um indicador
  // receita/despesa (seta colorida) derivado de categoria.tipo - não existe
  // ícone por categoria no cadastro, então não inventamos um.
  const contatoOpts = useMemo(
    () => contatos.map((c) => ({ id: c.id, label: c.nome, sublabel: c.doc || undefined })),
    [contatos]
  );
  const categoriaOpts = useMemo(
    () => categorias.map((c) => ({
      id: c.id, label: comCodigo(c), sublabel: t("financeiro." + (c.tipo === "receita" ? "tipo.receber" : "tipo.pagar")),
      avatarChar: c.tipo === "receita" ? "↑" : "↓",
      avatarColor: c.tipo === "receita" ? "var(--fin-entrada)" : "var(--fin-saida)",
    })),
    [categorias, t]
  );
  // Só analítico ativo recebe lançamento (sintético é nó de agrupamento na árvore).
  const centroOpts = useMemo(
    () => centros.filter((c) => c.tipo !== "sintetico" && c.ativo === 1).map((c) => ({ id: c.id, label: comCodigo(c) })),
    [centros]
  );
  const contaOpts = useMemo(
    () => contas.filter((c) => c.ativo === 1).map((c) => ({ id: c.id, label: c.nome + (c.banco ? ` (${c.banco})` : "") })),
    [contas]
  );

  const detalhe = detalheId ? lancamentos.find((l) => l.id === detalheId) : null;

  if (carregando) return <div className="fin-loading">{t("common.loading")}</div>;
  if (erro) return <div className="fin-error">{erro}</div>;

  return (
    <div className="fin-novo-titulo fin-lanc">
      <div className="fin-lanc-header">
        <h2 className="contatos-titulo">{t("financeiro.lanc.headerTitulo")}</h2>
        <p className="contatos-contador">{t("financeiro.lanc.headerSubtitulo")}</p>
      </div>

      <div className="fin-lanc-tipo-toggle">
        <button
          type="button" className={"fin-lanc-tipo-btn tipo-receber" + (form.tipo === "receber" ? " active" : "")}
          onClick={() => setForm({ ...form, tipo: "receber" })}
        >
          {t("financeiro.lanc.tipoReceber")}
        </button>
        <button
          type="button" className={"fin-lanc-tipo-btn tipo-pagar" + (form.tipo === "pagar" ? " active" : "")}
          onClick={() => setForm({ ...form, tipo: "pagar" })}
        >
          {t("financeiro.lanc.tipoPagar")}
        </button>
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="fin-lanc-form">
        {/* Bloco 1 - Entidade & Identificação */}
        <fieldset className="fin-bloco">
          <legend>{t("financeiro.lanc.blocoEntidade")}</legend>
          <div className="fin-modal-grid">
            <label className="fin-field fin-field-wide">
              <span>{t("financeiro.col.contraparte")}</span>
              <SearchSelect
                value={form.contatoId}
                onChange={(id) => setForm({ ...form, contatoId: id })}
                options={contatoOpts}
                allLabel={t("financeiro.form.semContato")}
              />
            </label>
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
          </div>
        </fieldset>

        {/* Bloco 2 - Apropriação Financeira & DRE */}
        <fieldset className="fin-bloco">
          <legend>{t("financeiro.lanc.blocoApropriacao")}</legend>
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
            <label className="fin-field">
              <span>{t("financeiro.lanc.contaLiquidacao")}</span>
              <SearchSelect
                value={form.contaId}
                onChange={(id) => setForm({ ...form, contaId: id })}
                options={contaOpts}
                allLabel={t("financeiro.baixa.semConta")}
              />
            </label>
          </div>
          <label className="fin-field" style={{ marginTop: 10 }}>
            <span>{t("financeiro.tit.formaPagto")}</span>
            <div className="fin-forma-badges">
              {FORMAS.map((k) => (
                <button
                  key={k} type="button"
                  className={"fin-forma-badge" + (form.formaPagto === k ? " sel" : "")}
                  onClick={() => setForm({ ...form, formaPagto: form.formaPagto === k ? "" : k })}
                >
                  {t("financeiro.forma." + k)}
                </button>
              ))}
            </div>
          </label>
        </fieldset>

        {/* Bloco 3 - Valores, Deduções & Cálculo Automático */}
        <fieldset className="fin-bloco">
          <legend>{t("financeiro.lanc.blocoValores")}</legend>
          <div className="fin-modal-grid">
            <label className="fin-field fin-field-wide">
              <span>{t("financeiro.tit.valorTitulo")}</span>
              <input type="number" step="0.01" min="0" className="fin-lanc-valor-bruto" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
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
          </div>
          <div className={"fin-tit-liquido fin-lanc-liquido-destaque " + (form.tipo === "receber" ? "tema-receber" : "tema-pagar")}>
            <span>{t("financeiro.tit.valorLiquido")}</span>
            <strong>{formatCents(liquido, lang)}</strong>
          </div>
        </fieldset>

        {/* Bloco 4 - Condições Especiais & Parcelamento */}
        <fieldset className="fin-bloco">
          <legend>{t("financeiro.lanc.parcelamentoTitulo")}</legend>
          <div className="fin-lanc-toggle-row">
            <span>{t("financeiro.lanc.parcelamentoPergunta")}</span>
            <label className="addon-toggle" title={!podeParcelar ? t("financeiro.lanc.parcelamentoBloqueado") : undefined}>
              <input type="checkbox" checked={parcelarAtivo} disabled={!podeParcelar} onChange={() => setParcelarAtivo((v) => !v)} />
              <span className="addon-toggle-track"><span className="addon-toggle-thumb" /></span>
            </label>
          </div>
          {!podeParcelar && <p className="fin-cad-hint">{t("financeiro.lanc.parcelamentoBloqueado")}</p>}
          {parcelarAtivo && podeParcelar && (
            <div className="fin-modal-grid">
              <label className="fin-field">
                <span>{t("financeiro.parcela.qtd")}</span>
                <input type="number" min="2" max="120" value={nParcelas} onChange={(e) => setNParcelas(e.target.value)} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.lanc.periodicidade")}</span>
                <select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value)}>
                  <option value="1">{t("financeiro.lanc.periodicidadeMensal")}</option>
                  <option value="3">{t("financeiro.lanc.periodicidadeTrimestral")}</option>
                  <option value="6">{t("financeiro.lanc.periodicidadeSemestral")}</option>
                  <option value="12">{t("financeiro.lanc.periodicidadeAnual")}</option>
                </select>
              </label>
            </div>
          )}
        </fieldset>

        {/* Bloco 5 - Observações & Anexos */}
        <fieldset className="fin-bloco">
          <legend>{t("financeiro.lanc.blocoAnexos")}</legend>
          <label className="fin-field">
            <span>{t("financeiro.tit.observacao")}</span>
            <textarea rows={2} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          </label>
          <AnexosLancamento pendentes={anexosPendentes} onPendentesChange={setAnexosPendentes} />
        </fieldset>

        {/* Rodapé fixo de ações */}
        <div className="fin-lanc-footer">
          <span className="fin-lanc-footer-msg">
            {formErro
              ? <span className="fin-error">{formErro}</span>
              : (parcelarAtivo && podeParcelar && Number(nParcelas) > 1 && reaisParaCents(form.valor)
                ? t("financeiro.lanc.parcelamentoResumo", { n: nParcelas, valor: formatCents(Math.round((reaisParaCents(form.valor) || 0) / Number(nParcelas)), lang) })
                : null)}
          </span>
          <div className="fin-lanc-footer-acoes">
            <button type="button" className="btn-secondary btn-small" disabled={salvando} onClick={() => salvar("provisionado", false)}>
              {t("financeiro.lanc.footerRascunho")}
            </button>
            <button type="button" className="recurrence-btn-primary" disabled={salvando} onClick={() => salvar("pendente", podeEmitirBoleto)}>
              {podeEmitirBoleto ? t("financeiro.lanc.footerEmitir") : t("financeiro.lanc.footerConfirmar")}
            </button>
          </div>
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
