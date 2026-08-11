import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents, reaisParaCents } from "./dinheiro.js";
import { comCodigo } from "./rotulo.js";
import LancamentoModal from "./LancamentoModal.jsx";

function formVazio() {
  return {
    tipo: "receber", descricao: "", valor: "", due: new Date().toISOString().slice(0, 10),
    categoryId: "", centroCustoId: "", contatoId: "", contaId: "", doc: "",
  };
}

export default function LancamentosView() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();

  const [categorias, setCategorias] = useState([]);
  const [centros, setCentros] = useState([]);
  const [contatos, setContatos] = useState([]);
  const [contas, setContas] = useState([]);
  const [lancamentos, setLancamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(formVazio());
  const [enviando, setEnviando] = useState(false);
  const [formErro, setFormErro] = useState("");
  const [detalheId, setDetalheId] = useState(null);

  // Busca e filtros
  const [busca, setBusca] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fCentro, setFCentro] = useState("");
  const [fConta, setFConta] = useState("");
  const [fDe, setFDe] = useState("");
  const [fAte, setFAte] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const [cats, ccs, cts, cos, lancs] = await Promise.all([
        api.finListCategorias(lang), api.finListCentrosCusto(), api.finListContatos(), api.finListContas(), api.finListLancamentos(),
      ]);
      setCategorias(cats); setCentros(ccs); setContatos(cts); setContas(cos); setLancamentos(lancs);
      setErro("");
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  const catById = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias]);
  const centroById = useMemo(() => Object.fromEntries(centros.map((c) => [c.id, c])), [centros]);
  const contatoById = useMemo(() => Object.fromEntries(contatos.map((c) => [c.id, c])), [contatos]);
  const contaById = useMemo(() => Object.fromEntries(contas.map((c) => [c.id, c])), [contas]);

  function nomeContraparte(l) {
    return contatoById[l.contato_id]?.nome || l.contraparte || "";
  }

  // Filtro + busca, tudo em memória (volume baixo). A busca varre número, doc,
  // descrição e correntista de uma vez - é o "melhor" pedido: um campo só acha
  // qualquer coisa do título.
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lancamentos.filter((l) => {
      if (fTipo && l.tipo !== fTipo) return false;
      if (fStatus && l.status !== fStatus) return false;
      if (fCentro && l.centro_custo_id !== fCentro) return false;
      if (fConta && l.conta_id !== fConta) return false;
      if (fDe && l.due < fDe) return false;
      if (fAte && l.due > fAte) return false;
      if (q) {
        const alvo = `${l.numero} ${l.doc} ${l.descricao} ${nomeContraparte(l)}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentos, busca, fTipo, fStatus, fCentro, fConta, fDe, fAte, contatoById]);

  const totais = useMemo(() => {
    let receber = 0, pagar = 0;
    for (const l of visiveis) (l.tipo === "receber" ? (receber += l.valor_cents) : (pagar += l.valor_cents));
    return { receber, pagar, count: visiveis.length };
  }, [visiveis]);

  function limparFiltros() {
    setBusca(""); setFTipo(""); setFStatus(""); setFCentro(""); setFConta(""); setFDe(""); setFAte("");
  }
  const temFiltro = busca || fTipo || fStatus || fCentro || fConta || fDe || fAte;

  async function submitNovo(e) {
    e.preventDefault();
    setFormErro("");
    const valorCents = reaisParaCents(form.valor);
    if (!valorCents) return setFormErro(t("financeiro.form.valorInvalido"));
    if (!form.due) return setFormErro(t("financeiro.form.dataObrigatoria"));
    setEnviando(true);
    try {
      await api.finCreateLancamento({
        tipo: form.tipo, descricao: form.descricao.trim(), valorCents, due: form.due,
        // Emissão do documento nasce como hoje; editável depois no detalhe do título.
        emissao: new Date().toISOString().slice(0, 10),
        categoryId: form.categoryId || undefined, centroCustoId: form.centroCustoId || undefined,
        contatoId: form.contatoId || undefined, contaId: form.contaId || undefined, doc: form.doc.trim(),
      });
      setForm(formVazio());
      showToast(t("financeiro.toast.criado"));
      await carregar();
    } catch (err) {
      setFormErro(translateError(err, t));
    } finally {
      setEnviando(false);
    }
  }

  const detalhe = detalheId ? lancamentos.find((l) => l.id === detalheId) : null;

  if (carregando) return <div className="fin-loading">{t("common.loading")}</div>;
  if (erro) return <div className="fin-error">{erro}</div>;

  return (
    <div className="fin-lancamentos">
      <form className="fin-form" onSubmit={submitNovo}>
        <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
          <option value="receber">{t("financeiro.tipo.receber")}</option>
          <option value="pagar">{t("financeiro.tipo.pagar")}</option>
        </select>
        <input type="text" placeholder={t("financeiro.form.descricao")} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
        <input type="text" placeholder={t("financeiro.col.doc")} value={form.doc} onChange={(e) => setForm({ ...form, doc: e.target.value })} />
        <input type="number" step="0.01" min="0" placeholder={t("financeiro.form.valor")} value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
        <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
        <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
          <option value="">{t("financeiro.form.semClasse")}</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
        </select>
        <select value={form.centroCustoId} onChange={(e) => setForm({ ...form, centroCustoId: e.target.value })}>
          <option value="">{t("financeiro.form.semCentro")}</option>
          {centros.map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
        </select>
        <select value={form.contatoId} onChange={(e) => setForm({ ...form, contatoId: e.target.value })}>
          <option value="">{t("financeiro.form.semContato")}</option>
          {contatos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <button type="submit" className="btn-primary btn-small" disabled={enviando}>{t("financeiro.form.adicionar")}</button>
      </form>
      {formErro && <div className="fin-error">{formErro}</div>}

      <div className="fin-toolbar">
        <div className="fin-search">
          <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14" /></svg>
          <input type="text" placeholder={t("financeiro.busca")} value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
          <option value="">{t("financeiro.filtro.todosTipos")}</option>
          <option value="receber">{t("financeiro.tipo.receber")}</option>
          <option value="pagar">{t("financeiro.tipo.pagar")}</option>
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">{t("financeiro.filtro.todosStatus")}</option>
          <option value="pendente">{t("financeiro.status.pendente")}</option>
          <option value="pago">{t("financeiro.status.pago")}</option>
        </select>
        <select value={fCentro} onChange={(e) => setFCentro(e.target.value)}>
          <option value="">{t("financeiro.filtro.todosCentros")}</option>
          {centros.map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
        </select>
        <select value={fConta} onChange={(e) => setFConta(e.target.value)}>
          <option value="">{t("financeiro.filtro.todasContas")}</option>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <label className="fin-filtro-data">{t("financeiro.periodo.de")}<input type="date" value={fDe} onChange={(e) => setFDe(e.target.value)} /></label>
        <label className="fin-filtro-data">{t("financeiro.periodo.ate")}<input type="date" value={fAte} onChange={(e) => setFAte(e.target.value)} /></label>
        {temFiltro && <button className="btn-ghost btn-small" onClick={limparFiltros}>{t("financeiro.filtro.limpar")}</button>}
      </div>

      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>{t("financeiro.col.titulo")}</th>
              <th>{t("financeiro.col.doc")}</th>
              <th>{t("financeiro.col.descricao")}</th>
              <th>{t("financeiro.col.contraparte")}</th>
              <th>{t("financeiro.col.categoria")}</th>
              <th>{t("financeiro.col.centro")}</th>
              <th>{t("financeiro.col.vencimento")}</th>
              <th className="fin-num">{t("financeiro.col.valor")}</th>
              <th>{t("financeiro.col.status")}</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr><td colSpan={9} className="fin-empty">{t("financeiro.vazio")}</td></tr>
            ) : (
              visiveis.map((l) => (
                <tr key={l.id} className={l.status === "pago" ? "fin-row-pago" : ""}>
                  <td>
                    <button className="fin-titulo-link" onClick={() => setDetalheId(l.id)}>{l.numero}</button>
                    {l.origem === "imposto_retido" && <span className="fin-tag-imposto" title={t("financeiro.tit.badgeImposto")}>{t("financeiro.tit.badgeImposto")}</span>}
                  </td>
                  <td>{l.doc || "-"}</td>
                  <td>{l.descricao || "-"}</td>
                  <td>{nomeContraparte(l) || "-"}</td>
                  <td>{comCodigo(catById[l.category_id]) || "-"}</td>
                  <td>{comCodigo(centroById[l.centro_custo_id]) || "-"}</td>
                  <td>{l.due}</td>
                  <td className={"fin-num " + (l.tipo === "receber" ? "fin-receber" : "fin-pagar")}>
                    {l.tipo === "receber" ? "+" : "-"} {formatCents(l.valor_cents, lang)}
                  </td>
                  <td><span className={"fin-badge fin-badge-" + l.status}>{t("financeiro.status." + l.status)}</span></td>
                </tr>
              ))
            )}
          </tbody>
          {visiveis.length > 0 && (
            <tfoot>
              <tr className="fin-total-row">
                <td colSpan={7}>{t("financeiro.total.titulos", { n: totais.count })}</td>
                <td className="fin-num">
                  <span className="fin-receber">+{formatCents(totais.receber, lang)}</span>{" "}
                  <span className="fin-pagar">-{formatCents(totais.pagar, lang)}</span>
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {detalhe && (
        <LancamentoModal
          lancamento={detalhe}
          categorias={categorias}
          centros={centros}
          contatos={contatos}
          contas={contas}
          todos={lancamentos}
          onClose={() => setDetalheId(null)}
          onChanged={() => { setDetalheId(null); carregar(); }}
        />
      )}
    </div>
  );
}
