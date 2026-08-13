import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents, reaisParaCents, liquidoDoLancamento } from "./dinheiro.js";
import { comCodigo } from "./rotulo.js";
import SearchSelect from "./SearchSelect.jsx";
import LancamentoModal from "./LancamentoModal.jsx";

// Aba Títulos: só a consulta. Lançar um título novo é na aba Lançamentos - aqui
// se acha, filtra e abre o detalhe do que já existe. A busca é a razão desta
// tela: um campo de texto que varre tudo, mais filtros por tipo, situação,
// classe, centro, conta, cliente/fornecedor, número exato, período e faixa de
// valor.
//
// A tela abre VAZIA e só traz os títulos quando o usuário clica em Pesquisar
// (mesmo padrão da Movimentação) - não despeja a base inteira ao entrar. Os
// cadastros de apoio (para os dropdowns e o modal) carregam ao montar; os títulos
// só na busca. Uma vez carregados, os filtros refinam em memória (volume baixo,
// alguns milhares de títulos no máximo), então mudar um dropdown é instantâneo e
// não rebate no servidor.
const ABERTOS = ["provisionado", "pendente", "disponivel"];
const ehAberto = (l) => ABERTOS.includes(l.status);

// "Hoje" em data civil YYYY-MM-DD no horário local - o padrão da data de baixa.
function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TitulosView() {
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
  const [detalheId, setDetalheId] = useState(null);
  // Quitação em lote: títulos marcados, conta de destino da baixa e trava enquanto processa.
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [contaBaixa, setContaBaixa] = useState("");
  const [dataBaixa, setDataBaixa] = useState(hojeCivil);
  const [quitando, setQuitando] = useState(false);

  // Busca e filtros. `busca` é o termo APLICADO (o que filtra); `buscaInput` é o
  // que está sendo digitado - a busca só vale ao clicar em Pesquisar (ou Enter),
  // não a cada tecla. `buscou` guarda se já houve uma busca: antes dela a tela
  // fica vazia, sem tabela nem totais.
  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [buscou, setBuscou] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [fTipo, setFTipo] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fCategoria, setFCategoria] = useState("");
  const [fCentro, setFCentro] = useState("");
  const [fConta, setFConta] = useState("");
  const [fContato, setFContato] = useState("");
  const [fNumero, setFNumero] = useState("");
  const [fDe, setFDe] = useState("");
  const [fAte, setFAte] = useState("");
  const [fValMin, setFValMin] = useState("");
  const [fValMax, setFValMax] = useState("");

  // Cadastros de apoio: dropdowns dos filtros + o modal de detalhe. Carregam uma
  // vez ao entrar. Os títulos NÃO vêm aqui - só na busca.
  async function carregarCadastros() {
    setCarregando(true);
    try {
      const [cats, ccs, cts, cos, imps] = await Promise.all([
        api.finListCategorias(lang), api.finListCentrosCusto(), api.finListContatos(), api.finListContas(), api.finListImpostos(),
      ]);
      setCategorias(cats); setCentros(ccs); setContatos(cts); setContas(cos); setImpostosCadastro(imps);
      setErro("");
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setCarregando(false);
    }
  }
  // Rebusca só os títulos: na Pesquisa e depois de quitar/editar (que mudam o que
  // está no banco). Mantém a tela no estado "já buscou".
  async function recarregarLancamentos() {
    try {
      setLancamentos(await api.finListLancamentos());
      setErro("");
    } catch (err) {
      setErro(translateError(err, t));
    }
  }
  useEffect(() => { carregarCadastros(); /* eslint-disable-next-line */ }, []);

  const catById = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias]);
  const centroById = useMemo(() => Object.fromEntries(centros.map((c) => [c.id, c])), [centros]);
  const contatoById = useMemo(() => Object.fromEntries(contatos.map((c) => [c.id, c])), [contatos]);
  const contatoOpts = useMemo(() => contatos.map((c) => ({ id: c.id, label: c.nome })), [contatos]);

  function nomeContraparte(l) {
    return contatoById[l.contato_id]?.nome || l.contraparte || "";
  }

  // Faixa de valor: só vira filtro quando o campo tem algo. reaisParaCents
  // devolve null para vazio/inválido, e null aqui significa "sem limite".
  const valMin = fValMin.trim() ? reaisParaCents(fValMin) : null;
  const valMax = fValMax.trim() ? reaisParaCents(fValMax) : null;

  // Filtro + busca, tudo em memória. A busca de texto varre número, doc,
  // descrição e correntista de uma vez - é o "melhor" pedido: um campo só acha
  // qualquer coisa do título. O campo "Nº do título" é casamento exato, para
  // quem já sabe o número e quer só aquele.
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const num = fNumero.trim();
    return lancamentos.filter((l) => {
      if (fTipo && l.tipo !== fTipo) return false;
      // Regra de exibição dos quitados: por PADRÃO a lista mostra só os títulos EM
      // ABERTO (quitado/finalizado e anulado ficam ocultos). Eles reaparecem só
      // quando o usuário age: escolhe "Todos", um status específico (ex.:
      // Finalizado), ou faz uma busca por texto.
      if (fStatus === "todos") {
        /* sem restrição de status */
      } else if (fStatus) {
        if (l.status !== fStatus) return false;
      } else if (!q && !ABERTOS.includes(l.status)) {
        return false;
      }
      if (fCategoria && l.category_id !== fCategoria) return false;
      if (fCentro && l.centro_custo_id !== fCentro) return false;
      if (fConta && l.conta_id !== fConta) return false;
      if (fContato && l.contato_id !== fContato) return false;
      if (num && String(l.numero) !== num) return false;
      if (fDe && l.due < fDe) return false;
      if (fAte && l.due > fAte) return false;
      if (valMin != null && l.valor_cents < valMin) return false;
      if (valMax != null && l.valor_cents > valMax) return false;
      if (q) {
        const alvo = `${l.numero} ${l.doc} ${l.descricao} ${nomeContraparte(l)}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentos, busca, fTipo, fStatus, fCategoria, fCentro, fConta, fContato, fNumero, fDe, fAte, valMin, valMax, contatoById]);

  // Totais pelo LÍQUIDO (com desconto/retenções/multa/juros), igual à coluna Valor:
  // assim incluir juros/multa num título e salvar já reflete no valor exibido e na
  // soma, sem tocar no valor_cents (que segue sendo o principal do título).
  const totais = useMemo(() => {
    let receber = 0, pagar = 0;
    for (const l of visiveis) (l.tipo === "receber" ? (receber += liquidoDoLancamento(l)) : (pagar += liquidoDoLancamento(l)));
    return { receber, pagar, count: visiveis.length };
  }, [visiveis]);

  // Quitação: só os títulos EM ABERTO (provisionado/pendente/disponivel) podem ser
  // dados como quitados; finalizado já está, anulado não. A conta de destino é a
  // mesma para o lote (o extrato daquela conta some do dinheiro).
  const contasAtivas = useMemo(() => contas.filter((c) => c.ativo === 1), [contas]);
  useEffect(() => { if (!contaBaixa && contasAtivas.length) setContaBaixa(contasAtivas[0].id); }, [contasAtivas, contaBaixa]);
  const abertosVisiveis = useMemo(() => visiveis.filter(ehAberto), [visiveis]);
  const selVisiveis = useMemo(() => abertosVisiveis.filter((l) => selecionados.has(l.id)), [abertosVisiveis, selecionados]);
  const nSel = selVisiveis.length;
  const todosSel = abertosVisiveis.length > 0 && nSel === abertosVisiveis.length;

  function toggleSel(id) {
    setSelecionados((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleTodos() {
    setSelecionados((s) => {
      const n = new Set(s);
      if (todosSel) abertosVisiveis.forEach((l) => n.delete(l.id));
      else abertosVisiveis.forEach((l) => n.add(l.id));
      return n;
    });
  }
  async function darQuitado() {
    const ids = selVisiveis.map((l) => l.id);
    if (!ids.length || !contaBaixa || !dataBaixa) return;
    setErro(""); setQuitando(true);
    try {
      // Baixa todos na data escolhida (paidAt) - é o dia em que o dinheiro se moveu.
      for (const id of ids) await api.finBaixarLancamento(id, { contaId: contaBaixa, paidAt: dataBaixa });
      showToast(t("financeiro.tit.quitados", { n: ids.length }));
      setSelecionados(new Set());
      await recarregarLancamentos();
    } catch (e) {
      setErro(translateError(e, t));
    } finally {
      setQuitando(false);
    }
  }

  // Pesquisar: aplica o termo, marca que houve busca e (re)traz os títulos do
  // servidor. É o único caminho que preenche a tabela.
  async function pesquisar() {
    setBusca(buscaInput.trim());
    setBuscou(true);
    setBuscando(true);
    try { await recarregarLancamentos(); } finally { setBuscando(false); }
  }
  // Limpar volta a tela ao estado inicial: sem filtros e sem lista (nova busca do zero).
  function limparFiltros() {
    setBusca(""); setBuscaInput(""); setFTipo(""); setFStatus(""); setFCategoria(""); setFCentro(""); setFConta("");
    setFContato(""); setFNumero(""); setFDe(""); setFAte(""); setFValMin(""); setFValMax("");
    setBuscou(false); setLancamentos([]); setSelecionados(new Set());
  }
  const temFiltro = busca || fTipo || fStatus || fCategoria || fCentro || fConta || fContato || fNumero || fDe || fAte || fValMin || fValMax;

  const detalhe = detalheId ? lancamentos.find((l) => l.id === detalheId) : null;

  if (carregando) return <div className="fin-loading">{t("common.loading")}</div>;

  return (
    <div className="fin-titulos">
      <div className="fin-toolbar">
        <div className="fin-search">
          <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14" /></svg>
          <input
            type="text" placeholder={t("financeiro.busca")} value={buscaInput}
            onChange={(e) => setBuscaInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") pesquisar(); }}
          />
        </div>
        <button className="btn-primary btn-small" onClick={pesquisar} disabled={buscando}>{t("financeiro.pesquisar")}</button>
        <input className="fin-filtro-numero" type="text" inputMode="numeric" placeholder={t("financeiro.filtro.numero")} value={fNumero} onChange={(e) => setFNumero(e.target.value)} />
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
          <option value="">{t("financeiro.filtro.todosTipos")}</option>
          <option value="receber">{t("financeiro.tipo.receber")}</option>
          <option value="pagar">{t("financeiro.tipo.pagar")}</option>
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">{t("financeiro.filtro.emAberto")}</option>
          <option value="todos">{t("financeiro.filtro.todosStatus")}</option>
          <option value="provisionado">{t("financeiro.status.provisionado")}</option>
          <option value="pendente">{t("financeiro.status.pendente")}</option>
          <option value="disponivel">{t("financeiro.status.disponivel")}</option>
          <option value="finalizado">{t("financeiro.status.finalizado")}</option>
          <option value="anulado">{t("financeiro.status.anulado")}</option>
        </select>
        <select value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}>
          <option value="">{t("financeiro.filtro.todasCategorias")}</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
        </select>
        <select value={fCentro} onChange={(e) => setFCentro(e.target.value)}>
          <option value="">{t("financeiro.filtro.todosCentros")}</option>
          {centros.filter((c) => c.tipo !== "sintetico").map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
        </select>
        <select value={fConta} onChange={(e) => setFConta(e.target.value)}>
          <option value="">{t("financeiro.filtro.todasContas")}</option>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <div className="fin-toolbar-ss">
          <SearchSelect value={fContato} onChange={setFContato} options={contatoOpts} allLabel={t("financeiro.filtro.todosContatos")} />
        </div>
        <label className="fin-filtro-data">{t("financeiro.periodo.de")}<input type="date" value={fDe} onChange={(e) => setFDe(e.target.value)} /></label>
        <label className="fin-filtro-data">{t("financeiro.periodo.ate")}<input type="date" value={fAte} onChange={(e) => setFAte(e.target.value)} /></label>
        <input className="fin-filtro-valor" type="number" step="0.01" min="0" placeholder={t("financeiro.filtro.valorMin")} value={fValMin} onChange={(e) => setFValMin(e.target.value)} />
        <input className="fin-filtro-valor" type="number" step="0.01" min="0" placeholder={t("financeiro.filtro.valorMax")} value={fValMax} onChange={(e) => setFValMax(e.target.value)} />
        {temFiltro && <button className="btn-ghost btn-small" onClick={limparFiltros}>{t("financeiro.filtro.limpar")}</button>}
      </div>

      {erro && <div className="fin-error">{erro}</div>}

      {!buscou && !erro && (
        <div className="fin-empty fin-mov-prompt">{t("financeiro.tit.pesquisePrompt")}</div>
      )}

      {buscou && (
      <>
      {abertosVisiveis.length > 0 && (
        <div className="fin-quitar-bar">
          <span className="fin-quitar-count">{t("financeiro.tit.selecionados", { n: nSel })}</span>
          <label className="fin-quitar-conta">
            {t("financeiro.contas.nome")}
            <select value={contaBaixa} onChange={(e) => setContaBaixa(e.target.value)}>
              <option value="">{t("financeiro.baixa.semConta")}</option>
              {contasAtivas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="fin-quitar-conta">
            {t("financeiro.tit.dataBaixa")}
            <input type="date" value={dataBaixa} onChange={(e) => setDataBaixa(e.target.value)} />
          </label>
          <button className="btn-primary btn-small" disabled={nSel === 0 || !contaBaixa || !dataBaixa || quitando} onClick={darQuitado}>
            {t("financeiro.tit.darQuitado", { n: nSel })}
          </button>
        </div>
      )}

      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th className="fin-check-col"><input type="checkbox" checked={todosSel} onChange={toggleTodos} disabled={abertosVisiveis.length === 0} aria-label={t("financeiro.tit.selecionados", { n: nSel })} /></th>
              <th>{t("financeiro.col.titulo")}</th>
              <th>{t("financeiro.col.doc")}</th>
              <th>{t("financeiro.col.descricao")}</th>
              <th>{t("financeiro.col.contraparte")}</th>
              <th>{t("financeiro.col.categoria")}</th>
              <th>{t("financeiro.col.centro")}</th>
              <th>{t("financeiro.col.vencimento")}</th>
              <th className="fin-num">{t("financeiro.col.valor")}</th>
              <th>{t("financeiro.col.status")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr><td colSpan={11} className="fin-empty">{t("financeiro.vazio")}</td></tr>
            ) : (
              visiveis.map((l) => (
                <tr key={l.id} className={l.status === "finalizado" || l.status === "anulado" ? "fin-row-pago" : (selecionados.has(l.id) ? "fin-row-sel" : "")}>
                  <td className="fin-check-col">{ehAberto(l) ? <input type="checkbox" checked={selecionados.has(l.id)} onChange={() => toggleSel(l.id)} /> : null}</td>
                  <td>
                    <button className="fin-titulo-link" onClick={() => setDetalheId(l.id)}>{l.numero}</button>
                    {l.origem === "imposto_aplicado" && <span className="fin-tag-imposto" title={t("financeiro.tit.badgeImposto")}>{t("financeiro.tit.badgeImposto")}</span>}
                    {l.parcela_total && <span className="fin-tag-parcela">{t("financeiro.parcela.xdeN", { x: l.parcela_num, n: l.parcela_total })}</span>}
                  </td>
                  <td>{l.doc || "-"}</td>
                  <td>{l.descricao || "-"}</td>
                  <td>{nomeContraparte(l) || "-"}</td>
                  <td>{comCodigo(catById[l.category_id]) || "-"}</td>
                  <td>{l.apropriacao_count > 0 ? <span className="fin-tag-rateado">{t("financeiro.tit.rateadoN", { n: l.apropriacao_count })}</span> : (comCodigo(centroById[l.centro_custo_id]) || "-")}</td>
                  <td>{l.due}</td>
                  <td className={"fin-num " + (l.tipo === "receber" ? "fin-receber" : "fin-pagar")}>
                    {l.tipo === "receber" ? "+" : "-"} {formatCents(liquidoDoLancamento(l), lang)}
                  </td>
                  <td><span className={"fin-badge fin-badge-" + l.status}>{t("financeiro.status." + l.status)}</span></td>
                  <td className="fin-row-actions">
                    <button className="btn-ghost btn-small" onClick={() => setDetalheId(l.id)}>{t("financeiro.cad.editar")}</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {visiveis.length > 0 && (
            <tfoot>
              <tr className="fin-total-row">
                <td colSpan={8}>{t("financeiro.total.titulos", { n: totais.count })}</td>
                <td className="fin-num">
                  <span className="fin-receber">+{formatCents(totais.receber, lang)}</span>{" "}
                  <span className="fin-pagar">-{formatCents(totais.pagar, lang)}</span>
                </td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </>
      )}

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
          onChanged={() => { setDetalheId(null); recarregarLancamentos(); }}
          onRefreshList={recarregarLancamentos}
        />
      )}
    </div>
  );
}
