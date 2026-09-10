import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { whatsappLink } from "../../utils/contact.js";
import { formatCents, reaisParaCents, liquidoDoLancamento } from "./dinheiro.js";
import { comCodigo } from "./rotulo.js";
import SearchSelect from "./SearchSelect.jsx";
import LancamentoModal from "./LancamentoModal.jsx";
import NovoTituloModal from "./NovoTituloModal.jsx";

// Central de Gestão de Títulos (contas a pagar e a receber): KPIs do mês +
// inadimplência, segmented control Todos/Receber/Pagar, pílulas de situação
// (a "Vencidos" é derivada no cliente - não existe status real de vencido,
// título vencido é só um aberto com due no passado), busca global ao vivo e
// um painel de filtros avançados (antes eram 5 selects soltos na toolbar).
// Ao contrário da versão anterior desta tela, carrega sozinha no mount (era
// "gated" por um botão Pesquisar) - precisa ser assim para os KPIs terem algo
// para mostrar assim que a tela abre, como o resto do dashboard do módulo.
const ABERTOS = ["provisionado", "pendente", "disponivel"];
const ehAberto = (l) => ABERTOS.includes(l.status);

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function IconSearch({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function IconPlus({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconDownload({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
function IconKebab({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
    </svg>
  );
}
function IconFilter({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16l-6 8v6l-4 2v-8z" />
    </svg>
  );
}
function IconInvoice({ size = 28 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v18l-2.5-1.7L13 21l-1-1.7-1 1.7-2.5-1.7L6 21z" /><path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

// Kebab de ações por linha - mesmo desenho position:fixed de MovAcoesKebab
// (MovimentacaoView.jsx)/ContaAcoesKebab (contaCardParts.jsx), com o conjunto
// de ações de um título.
function TituloAcoesKebab({ l, t, podeGerarCobranca, podeWhatsapp, onEditar, onGerarCobranca, onWhatsapp, onCancelar }) {
  const [aberto, setAberto] = useState(false);
  const [coords, setCoords] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  function abrir(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setAberto((v) => !v);
  }

  // Precisa checar por REF, não por classe - todo kebab de linha usa a mesma
  // classe (.tit-acoes-kebab-btn/-menu), então closest(".classe") acharia
  // "dentro" o botão de QUALQUER outra linha, e clicar no kebab da linha B
  // nunca fecharia o menu já aberto da linha A.
  useEffect(() => {
    if (!aberto) return;
    function onDoc(e) {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setAberto(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [aberto]);

  function acao(fn) {
    return () => { setAberto(false); fn(); };
  }

  return (
    <>
      <button type="button" ref={btnRef} className="row-menu-btn tit-acoes-kebab-btn" onClick={abrir} aria-label={t("financeiro.titulos.acoesLinha")}>
        <IconKebab />
      </button>
      {aberto && coords && (
        <div className="dropdown tit-acoes-kebab-menu" ref={menuRef} style={{ position: "fixed", top: coords.top, right: coords.right }}>
          <div className="dropdown-item" onClick={acao(onEditar)}>{t("financeiro.titulos.menuEditar")}</div>
          <div className={"dropdown-item" + (podeGerarCobranca ? "" : " disabled")} onClick={podeGerarCobranca ? acao(onGerarCobranca) : undefined}>
            {t("financeiro.titulos.menuGerarCobranca")}
          </div>
          <div className={"dropdown-item" + (podeWhatsapp ? "" : " disabled")} onClick={podeWhatsapp ? acao(onWhatsapp) : undefined}>
            {t("financeiro.titulos.menuWhatsapp")}
          </div>
          {l.status !== "anulado" && (
            <>
              <div className="dropdown-divider" />
              <div className="dropdown-item danger" onClick={acao(onCancelar)}>{t("financeiro.titulos.menuCancelar")}</div>
            </>
          )}
        </div>
      )}
    </>
  );
}

// Popover pequeno de "Dar Baixa" direto na linha - mesma técnica
// position:fixed, só com dois campos (conta + data) e um confirmar. Baixa é
// sempre TOTAL: baixarLancamento no servidor não tem parâmetro de valor, não
// existe baixa parcial de um título já lançado neste projeto (só desdobrar
// ANTES da baixa, que já é uma ação própria dentro do detalhe do título).
function BaixaPopover({ l, contas, t, lang, onConfirmar }) {
  const [aberto, setAberto] = useState(false);
  const [coords, setCoords] = useState(null);
  const [contaId, setContaId] = useState("");
  const [data, setData] = useState(() => hojeCivil());
  const [enviando, setEnviando] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  function abrir(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setAberto((v) => !v);
  }

  // Por ref, não por classe - mesma razão do TituloAcoesKebab acima (todo
  // popover de linha compartilha .tit-baixa-popover/-btn).
  useEffect(() => {
    if (!aberto) return;
    function onDoc(e) {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setAberto(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [aberto]);

  async function confirmar() {
    setEnviando(true);
    try {
      await onConfirmar(l.id, { contaId: contaId || undefined, paidAt: data });
      setAberto(false);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button type="button" ref={btnRef} className="btn-secondary btn-small tit-baixa-btn" onClick={abrir} title={t("financeiro.titulos.darBaixaHint")}>
        {t("financeiro.acao.baixar")}
      </button>
      {aberto && coords && (
        <div className="tit-baixa-popover" ref={popRef} style={{ position: "fixed", top: coords.top, right: coords.right }}>
          <span className="tit-baixa-popover-titulo">{t("financeiro.titulos.darBaixaTitulo", { n: l.numero })}</span>
          <label>
            <span>{t("financeiro.contas.nome")}</span>
            <select value={contaId} onChange={(e) => setContaId(e.target.value)}>
              <option value="">{t("financeiro.baixa.semConta")}</option>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` (${c.banco})` : ""}</option>)}
            </select>
          </label>
          <label>
            <span>{t("financeiro.tit.dataBaixa")}</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <button type="button" className="btn-primary btn-small" onClick={confirmar} disabled={enviando}>
            {t("financeiro.baixa.confirmar")}
          </button>
        </div>
      )}
    </>
  );
}

export default function TitulosView({ onGerarCobranca }) {
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
  const [criando, setCriando] = useState(false);

  const [selecionados, setSelecionados] = useState(new Set());
  const [contaBaixa, setContaBaixa] = useState("");
  const [dataBaixa, setDataBaixa] = useState(() => hojeCivil());
  const [quitando, setQuitando] = useState(false);

  const [busca, setBusca] = useState("");
  const [fTipo, setFTipo] = useState(""); // "" | "receber" | "pagar"
  const [fSituacao, setFSituacao] = useState("aberto"); // "" (todos) | aberto | vencidos | pagos | cancelados
  const [fCategoria, setFCategoria] = useState("");
  const [fCentro, setFCentro] = useState("");
  const [fConta, setFConta] = useState("");
  const [fDe, setFDe] = useState("");
  const [fAte, setFAte] = useState("");
  const [fValMin, setFValMin] = useState("");
  const [fValMax, setFValMax] = useState("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [exportAberto, setExportAberto] = useState(false);
  const exportRef = useRef(null);

  async function carregar() {
    setErro("");
    try {
      const [cats, ccs, cts, cos, imps, lancs] = await Promise.all([
        api.finListCategorias(lang), api.finListCentrosCusto(), api.finListContatos(),
        api.finListContas(), api.finListImpostos(), api.finListLancamentos(),
      ]);
      setCategorias(cats); setCentros(ccs); setContatos(cts); setContas(cos); setImpostosCadastro(imps); setLancamentos(lancs);
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  async function recarregarLancamentos() { setLancamentos(await api.finListLancamentos()); }

  useEffect(() => {
    if (!exportAberto) return;
    function onDoc(e) { if (exportRef.current && !exportRef.current.contains(e.target)) setExportAberto(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [exportAberto]);

  const catById = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias]);
  const centroById = useMemo(() => Object.fromEntries(centros.map((c) => [c.id, c])), [centros]);
  const contatoById = useMemo(() => Object.fromEntries(contatos.map((c) => [c.id, c])), [contatos]);
  const contatoOpts = useMemo(() => contatos.map((c) => ({ id: c.id, label: c.nome })), [contatos]);
  function nomeContraparte(l) { return contatoById[l.contato_id]?.nome || l.contraparte || ""; }

  const contasAtivas = useMemo(() => contas.filter((c) => c.ativo === 1), [contas]);
  const categoriaOpts = useMemo(() => categorias.map((c) => ({ id: c.id, label: comCodigo(c) })), [categorias]);
  const centroOpts = useMemo(() => centros.filter((c) => c.tipo !== "sintetico").map((c) => ({ id: c.id, label: comCodigo(c) })), [centros]);

  const hoje = hojeCivil();
  const mesAtual = hoje.slice(0, 7);

  // 4 KPIs: fotografia do cadastro inteiro (lancamentos), não dos filtros da
  // tela - senão filtrar a lista "esconderia" o próprio dashboard.
  const kpis = useMemo(() => {
    let receberAbertoMes = 0, receberPagoMes = 0, pagarAbertoMes = 0, pagarPagoMes = 0, vencidosCents = 0;
    for (const l of lancamentos) {
      const liq = liquidoDoLancamento(l);
      const doMes = (l.due || "").slice(0, 7) === mesAtual;
      if (doMes && l.tipo === "receber") {
        if (ehAberto(l)) receberAbertoMes += liq;
        else if (l.status === "finalizado") receberPagoMes += liq;
      }
      if (doMes && l.tipo === "pagar") {
        if (ehAberto(l)) pagarAbertoMes += liq;
        else if (l.status === "finalizado") pagarPagoMes += liq;
      }
      if (ehAberto(l) && l.due && l.due < hoje) vencidosCents += liq;
    }
    const progressoReceber = receberAbertoMes + receberPagoMes > 0 ? Math.round((receberPagoMes / (receberAbertoMes + receberPagoMes)) * 100) : 0;
    const progressoPagar = pagarAbertoMes + pagarPagoMes > 0 ? Math.round((pagarPagoMes / (pagarAbertoMes + pagarPagoMes)) * 100) : 0;
    return {
      receberMesCents: receberAbertoMes, progressoReceber,
      pagarMesCents: pagarAbertoMes, progressoPagar,
      vencidosCents,
      // Saldo previsto = a receber - a pagar (sobra positiva = caixa sobra no
      // mês). O pedido original escreveu "a pagar - a receber", que fica
      // invertido (saldo "saudável" cada vez mais negativo) - corrigido aqui,
      // mesmo critério já usado noutras correções silenciosas desta sessão.
      saldoPrevistoCents: receberAbertoMes - pagarAbertoMes,
    };
  }, [lancamentos, hoje, mesAtual]);

  const valMin = fValMin.trim() ? reaisParaCents(fValMin) : null;
  const valMax = fValMax.trim() ? reaisParaCents(fValMax) : null;

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lancamentos.filter((l) => {
      if (fTipo && l.tipo !== fTipo) return false;
      if (fSituacao === "aberto" && !ehAberto(l)) return false;
      if (fSituacao === "vencidos" && !(ehAberto(l) && l.due && l.due < hoje)) return false;
      if (fSituacao === "pagos" && l.status !== "finalizado") return false;
      if (fSituacao === "cancelados" && l.status !== "anulado") return false;
      if (fCategoria && l.category_id !== fCategoria) return false;
      if (fCentro && l.centro_custo_id !== fCentro) return false;
      if (fConta && l.conta_id !== fConta) return false;
      if (fDe && (!l.due || l.due < fDe)) return false;
      if (fAte && (!l.due || l.due > fAte)) return false;
      const liq = liquidoDoLancamento(l);
      if (valMin != null && liq < valMin) return false;
      if (valMax != null && liq > valMax) return false;
      if (q) {
        const alvo = [l.numero, l.doc, l.descricao, nomeContraparte(l)].filter(Boolean).join(" ").toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentos, busca, fTipo, fSituacao, fCategoria, fCentro, fConta, fDe, fAte, valMin, valMax, contatoById, hoje]);

  const totais = useMemo(() => {
    let receber = 0, pagar = 0;
    for (const l of visiveis) {
      const liq = liquidoDoLancamento(l);
      if (l.tipo === "receber") receber += liq; else pagar += liq;
    }
    return { receber, pagar, n: visiveis.length };
  }, [visiveis]);

  const filtrosAtivos = [fCategoria, fCentro, fConta, fDe, fAte, fValMin, fValMax].filter(Boolean).length;
  const temFiltro = !!(busca || fTipo || fSituacao !== "aberto" || filtrosAtivos);

  function limparFiltros() {
    setBusca(""); setFTipo(""); setFSituacao("aberto");
    setFCategoria(""); setFCentro(""); setFConta(""); setFDe(""); setFAte(""); setFValMin(""); setFValMax("");
  }

  const abertosVisiveis = useMemo(() => visiveis.filter(ehAberto), [visiveis]);
  const selVisiveis = useMemo(() => abertosVisiveis.filter((l) => selecionados.has(l.id)), [abertosVisiveis, selecionados]);
  const nSel = selVisiveis.length;
  const todosSel = abertosVisiveis.length > 0 && nSel === abertosVisiveis.length;
  function toggleSel(id) {
    setSelecionados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleTodos() {
    setSelecionados((s) => {
      if (todosSel) return new Set();
      return new Set(abertosVisiveis.map((l) => l.id));
    });
  }
  async function darQuitado() {
    setQuitando(true);
    try {
      const ids = selVisiveis.map((l) => l.id);
      for (const id of ids) await api.finBaixarLancamento(id, { contaId: contaBaixa || undefined, paidAt: dataBaixa });
      showToast(t("financeiro.tit.quitados", { n: ids.length }));
      setSelecionados(new Set());
      await recarregarLancamentos();
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setQuitando(false);
    }
  }

  async function baixarUm(id, params) {
    try {
      await api.finBaixarLancamento(id, params);
      showToast(t("financeiro.toast.salvo"));
      await recarregarLancamentos();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function cancelarTitulo(l) {
    if (!confirm(t("financeiro.confirm.anular"))) return;
    try {
      await api.finMudarStatus(l.id, "anulado");
      showToast(t("financeiro.toast.situacaoAlterada"));
      await recarregarLancamentos();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  function gerarCobranca(l) {
    onGerarCobranca?.({
      contatoId: l.contato_id,
      descricao: l.descricao || l.numero,
      valorInicial: String(liquidoDoLancamento(l) / 100),
    });
  }

  function enviarWhatsapp(l) {
    const contato = contatoById[l.contato_id];
    if (!contato?.telefone) return;
    const msg = t("financeiro.titulos.whatsappMsg", {
      nome: contato.nome, numero: l.numero, valor: formatCents(liquidoDoLancamento(l), lang), venc: l.due,
    });
    window.open(whatsappLink(contato.telefone, msg), "_blank", "noopener,noreferrer");
  }

  async function exportar(formato) {
    setExportAberto(false);
    try {
      await api.finExportTitulos(formato, lang);
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  const detalhe = detalheId ? lancamentos.find((l) => l.id === detalheId) : null;

  if (carregando) return <div className="fin-loading">{t("common.loading")}</div>;

  return (
    <div className="fin-titulos">
      <div className="contatos-header">
        <div>
          <h2 className="contatos-titulo">{t("financeiro.titulos.headerTitulo")}</h2>
          <p className="contatos-contador">{t("financeiro.titulos.headerSubtitulo")}</p>
        </div>
        <div className="contatos-header-acoes">
          <div className="contatos-export" ref={exportRef}>
            <button type="button" className="btn-secondary btn-small" onClick={() => setExportAberto((v) => !v)}>
              <IconDownload /> {t("financeiro.titulos.exportarRelatorio")}
            </button>
            {exportAberto && (
              <div className="dropdown">
                <div className="dropdown-item" onClick={() => exportar("csv")}>{t("financeiro.titulos.exportarCsv")}</div>
                <div className="dropdown-item" onClick={() => exportar("pdf")}>{t("financeiro.titulos.exportarPdf")}</div>
              </div>
            )}
          </div>
          <button type="button" className="recurrence-btn-primary" onClick={() => setCriando(true)}>
            <IconPlus /> {t("financeiro.titulos.novoTitulo")}
          </button>
        </div>
      </div>

      {erro && <div className="fin-error">{erro}</div>}

      <div className="fin-kpis">
        <div className="fin-kpi fin-kpi-receber">
          <span className="fin-kpi-label">{t("financeiro.titulos.kpiReceber")}</span>
          <span className="fin-kpi-value">{formatCents(kpis.receberMesCents, lang)}</span>
          <span className="tit-kpi-progresso">{t("financeiro.titulos.kpiProgresso", { n: kpis.progressoReceber })}</span>
        </div>
        <div className="fin-kpi fin-kpi-pagar">
          <span className="fin-kpi-label">{t("financeiro.titulos.kpiPagar")}</span>
          <span className="fin-kpi-value">{formatCents(kpis.pagarMesCents, lang)}</span>
          <span className="tit-kpi-progresso">{t("financeiro.titulos.kpiProgresso", { n: kpis.progressoPagar })}</span>
        </div>
        <div className="fin-kpi fin-kpi-atrasado">
          <span className="fin-kpi-label">{t("financeiro.titulos.kpiVencidos")}</span>
          <span className="fin-kpi-value">{formatCents(kpis.vencidosCents, lang)}</span>
          {kpis.vencidosCents > 0 && <span className="fin-cobr-kpi-alerta">{t("financeiro.cobrancas.kpi.atencao")}</span>}
        </div>
        <div className={"fin-kpi " + (kpis.saldoPrevistoCents >= 0 ? "fin-kpi-receber" : "fin-kpi-pagar")}>
          <span className="fin-kpi-label">{t("financeiro.titulos.kpiSaldoPrevisto")}</span>
          <span className="fin-kpi-value">{formatCents(kpis.saldoPrevistoCents, lang)}</span>
        </div>
      </div>

      <div className="timing-toggle">
        {["", "receber", "pagar"].map((v) => (
          <button key={v || "todos"} type="button" className={"timing-toggle-btn" + (fTipo === v ? " active" : "")} onClick={() => setFTipo(v)}>
            {v === "" ? t("financeiro.filtro.todosTipos") : t("financeiro.tipo." + v)}
          </button>
        ))}
      </div>
      <div className="timing-toggle">
        {["", "aberto", "vencidos", "pagos", "cancelados"].map((v) => (
          <button key={v || "todos"} type="button" className={"timing-toggle-btn" + (fSituacao === v ? " active" : "")} onClick={() => setFSituacao(v)}>
            {t("financeiro.titulos.pilula." + (v || "todos"))}
          </button>
        ))}
      </div>

      <div className="fin-toolbar">
        <label className="fin-search">
          <IconSearch />
          <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t("financeiro.titulos.buscaPlaceholder")} />
        </label>
        <button type="button" className={"btn-secondary btn-small" + (filtrosAtivos ? " tit-filtros-btn-ativo" : "")} onClick={() => setFiltrosAbertos((v) => !v)}>
          <IconFilter /> {t("financeiro.titulos.filtrosAvancados")}
          {filtrosAtivos > 0 && <span className="tit-filtros-badge">{filtrosAtivos}</span>}
        </button>
        {temFiltro && <button type="button" className="btn-ghost btn-small" onClick={limparFiltros}>{t("financeiro.filtro.limpar")}</button>}
      </div>

      {filtrosAbertos && (
        <div className="tit-filtros-painel">
          <label className="fin-field">
            <span>{t("financeiro.titulos.vencimentoDe")}</span>
            <input type="date" value={fDe} onChange={(e) => setFDe(e.target.value)} />
          </label>
          <label className="fin-field">
            <span>{t("financeiro.titulos.vencimentoAte")}</span>
            <input type="date" value={fAte} onChange={(e) => setFAte(e.target.value)} />
          </label>
          <label className="fin-field">
            <span>{t("financeiro.filtro.valorMin")}</span>
            <input type="number" step="0.01" min="0" value={fValMin} onChange={(e) => setFValMin(e.target.value)} />
          </label>
          <label className="fin-field">
            <span>{t("financeiro.filtro.valorMax")}</span>
            <input type="number" step="0.01" min="0" value={fValMax} onChange={(e) => setFValMax(e.target.value)} />
          </label>
          <label className="fin-field">
            <span>{t("financeiro.cad.centros")}</span>
            <select value={fCentro} onChange={(e) => setFCentro(e.target.value)}>
              <option value="">{t("financeiro.filtro.todosCentros")}</option>
              {centroOpts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="fin-field">
            <span>{t("financeiro.cad.classes")}</span>
            <select value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}>
              <option value="">{t("financeiro.filtro.todasCategorias")}</option>
              {categoriaOpts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="fin-field">
            <span>{t("financeiro.titulos.contaBancaria")}</span>
            <select value={fConta} onChange={(e) => setFConta(e.target.value)}>
              <option value="">{t("financeiro.filtro.todasContas")}</option>
              {contasAtivas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
        </div>
      )}

      {visiveis.length === 0 ? (
        <div className="contas-empty">
          <span className="contas-empty-icone"><IconInvoice /></span>
          <h3 className="contas-empty-titulo">{t("financeiro.titulos.emptyTitulo")}</h3>
          <p className="contas-empty-texto">{t("financeiro.titulos.emptyTexto")}</p>
          <div className="fin-modal-acoes">
            <button type="button" className="recurrence-btn-primary" onClick={() => setCriando(true)}>{t("financeiro.titulos.emptyBotaoCriar")}</button>
            {temFiltro && <button type="button" className="btn-ghost btn-small" onClick={limparFiltros}>{t("financeiro.filtro.limpar")}</button>}
          </div>
        </div>
      ) : (
        <>
          {abertosVisiveis.length > 0 && (
            <div className="fin-quitar-bar">
              <span>{t("financeiro.tit.selecionados", { n: nSel })}</span>
              <select value={contaBaixa} onChange={(e) => setContaBaixa(e.target.value)}>
                <option value="">{t("financeiro.baixa.semConta")}</option>
                {contasAtivas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <input type="date" value={dataBaixa} onChange={(e) => setDataBaixa(e.target.value)} />
              <button type="button" className="btn-primary btn-small" disabled={!nSel || quitando} onClick={darQuitado}>
                {t("financeiro.tit.darQuitado", { n: nSel })}
              </button>
            </div>
          )}

          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={todosSel} onChange={toggleTodos} disabled={!abertosVisiveis.length} /></th>
                  <th>{t("financeiro.col.titulo")}</th>
                  <th>{t("financeiro.col.contraparte")}</th>
                  <th>{t("financeiro.col.tipo")}</th>
                  <th>{t("financeiro.col.vencimento")}</th>
                  <th className="fin-num">{t("financeiro.col.valor")}</th>
                  <th>{t("financeiro.col.status")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => {
                  const liq = liquidoDoLancamento(l);
                  const contato = contatoById[l.contato_id];
                  const vencido = ehAberto(l) && l.due && l.due < hoje;
                  const diasAtraso = vencido ? Math.floor((new Date(hoje) - new Date(l.due)) / 86400000) : 0;
                  return (
                    <tr key={l.id} className={l.status === "finalizado" || l.status === "anulado" ? "fin-row-pago" : (selecionados.has(l.id) ? "fin-row-sel" : "")}>
                      <td>{ehAberto(l) && <input type="checkbox" checked={selecionados.has(l.id)} onChange={() => toggleSel(l.id)} />}</td>
                      <td>
                        <button type="button" className="fin-titulo-link" onClick={() => setDetalheId(l.id)}>{l.numero}</button>
                        {l.doc && <span className="tit-doc-discreto"> {l.doc}</span>}
                      </td>
                      <td>
                        <div className="tit-contraparte-nome">{nomeContraparte(l) || "-"}</div>
                        {contato?.doc && <div className="tit-doc-discreto">{contato.doc}</div>}
                      </td>
                      <td><span className={"mov-badge-tipo-" + (l.tipo === "receber" ? "entrada" : "saida")}>{t("financeiro.tipo." + l.tipo)}</span></td>
                      <td className={vencido ? "tit-venc-atrasado" : undefined}>{l.due}</td>
                      <td className={"fin-num " + (l.tipo === "receber" ? "fin-receber" : "fin-pagar")}>
                        {(l.tipo === "receber" ? "+ " : "- ") + formatCents(liq, lang)}
                      </td>
                      <td>
                        {vencido ? (
                          <span className="tit-vencido-pill">{t("financeiro.titulos.vencidoDias", { n: diasAtraso })}</span>
                        ) : (
                          <span className={"fin-badge fin-badge-" + l.status}>{t("financeiro.status." + l.status)}</span>
                        )}
                      </td>
                      <td className="fin-row-actions">
                        <div className="tit-acoes-linha">
                          {ehAberto(l) && <BaixaPopover l={l} contas={contasAtivas} t={t} lang={lang} onConfirmar={baixarUm} />}
                          <TituloAcoesKebab
                            l={l} t={t}
                            podeGerarCobranca={!!l.contato_id}
                            podeWhatsapp={!!contato?.telefone}
                            onEditar={() => setDetalheId(l.id)}
                            onGerarCobranca={() => gerarCobranca(l)}
                            onWhatsapp={() => enviarWhatsapp(l)}
                            onCancelar={() => cancelarTitulo(l)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>{t("financeiro.total.titulos", { n: totais.n })}</td>
                  <td className="fin-num">
                    <span className="fin-receber">+ {formatCents(totais.receber, lang)}</span>{" / "}
                    <span className="fin-pagar">- {formatCents(totais.pagar, lang)}</span>
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {detalhe && (
        <LancamentoModal
          lancamento={detalhe} categorias={categorias} centros={centros}
          contatos={contatos} contas={contas} impostosCadastro={impostosCadastro}
          todos={lancamentos} onClose={() => setDetalheId(null)}
          onChanged={() => { setDetalheId(null); recarregarLancamentos(); }}
          onRefreshList={recarregarLancamentos}
        />
      )}
      {criando && (
        <NovoTituloModal
          categorias={categorias} centros={centros} contatos={contatos}
          onClose={() => setCriando(false)}
          onCreated={async (id) => { setCriando(false); await recarregarLancamentos(); setDetalheId(id); }}
        />
      )}
    </div>
  );
}
