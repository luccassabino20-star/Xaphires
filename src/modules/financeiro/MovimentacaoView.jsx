import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents, liquidoDoLancamento } from "./dinheiro.js";
import { rotuloConta, detalheConta } from "./rotulo.js";
import SearchSelect from "./SearchSelect.jsx";
import LancamentoManualModal from "./LancamentoManualModal.jsx";
import EditarLancamentoModal from "./EditarLancamentoModal.jsx";
import ConciliacaoFechamentoDrawer from "./ConciliacaoFechamentoDrawer.jsx";
import { BancoBadge } from "./contaCardParts.jsx";

function IconHistorico({ size = 28 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <path d="M12 7v5l3.5 2" />
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
      <path d="M12 3v12m0 0-4-4m4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
function IconLock({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
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

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function civil(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inicioDoMes() {
  const d = new Date();
  return civil(new Date(d.getFullYear(), d.getMonth(), 1));
}
function addDias(dataCivil, n) {
  const [y, m, dd] = dataCivil.split("-").map(Number);
  return civil(new Date(y, m - 1, dd + n));
}
function mesPassadoRange() {
  const d = new Date();
  return [civil(new Date(d.getFullYear(), d.getMonth() - 1, 1)), civil(new Date(d.getFullYear(), d.getMonth(), 0))];
}
function diasEntre(de, ate) {
  const [y1, m1, d1] = de.split("-").map(Number);
  const [y2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}

const PILLS = ["hoje", "7dias", "mes", "mesPassado", "personalizado"];

// Extrato Operacional (Movimentação) no padrão Ultra-Premium: header com ações
// rápidas, 4 KPIs, filtros dinâmicos (conta/período/tipo/conciliação/busca),
// tabela agrupada por data, e os módulos de Conciliação & Fechamento e Editar
// Lançamento (novos). A busca continua sob demanda - nada carrega sozinho até
// escolher conta/período e filtrar; os chips de tipo/conciliação e a busca
// textual filtram em memória o que já veio, sem nova chamada ao servidor.
export default function MovimentacaoView() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);

  const [contatos, setContatos] = useState([]);
  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [fechamentos, setFechamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // Filtros do formulário
  const [contaId, setContaId] = useState("all");
  const [pill, setPill] = useState("mes");
  const [de, setDe] = useState(inicioDoMes());
  const [ate, setAte] = useState(hojeCivil());
  const [incluirEstornados, setIncluirEstornados] = useState(false);
  const [tipoChip, setTipoChip] = useState("todos");
  const [conciliacaoChip, setConciliacaoChip] = useState("todos");
  const [busca, setBusca] = useState("");

  const [resultado, setResultado] = useState(null);
  const [anterior, setAnterior] = useState(null);
  const [aplicado, setAplicado] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [manualAberto, setManualAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [conciliacaoAberta, setConciliacaoAberta] = useState(false);
  const [exportAberto, setExportAberto] = useState(false);

  async function carregarCadastros() {
    setCarregando(true);
    try {
      const [cts, cos, cats, fchs] = await Promise.all([
        api.finListContatos(), api.finListContas(), api.finListCategorias(lang), api.finListFechamentos(),
      ]);
      setContatos(cts); setContas(cos); setCategorias(cats); setFechamentos(fchs); setErro("");
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregarCadastros(); /* eslint-disable-next-line */ }, []);

  const contatoById = useMemo(() => Object.fromEntries(contatos.map((c) => [c.id, c])), [contatos]);
  const catById = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias]);
  const contaById = useMemo(() => Object.fromEntries(contas.map((c) => [c.id, c])), [contas]);
  const contasAtivas = useMemo(() => contas.filter((c) => c.ativo === 1), [contas]);
  const contaOpts = useMemo(
    () => [{ id: "all", label: t("financeiro.movimentacao.todasContas") }, ...contasAtivas.map((c) => ({ id: c.id, label: rotuloConta(c) }))],
    [contasAtivas, t]
  );
  const contaSel = contaId !== "all" ? contasAtivas.find((c) => c.id === contaId) : null;
  const fechadoSet = useMemo(() => new Set(fechamentos.map((f) => f.ano_mes)), [fechamentos]);

  const nomeContraparte = (l) => contatoById[l.contato_id]?.nome || l.contraparte || "-";

  function aplicarPill(p) {
    setPill(p);
    if (p === "hoje") { setDe(hojeCivil()); setAte(hojeCivil()); }
    else if (p === "7dias") { setDe(addDias(hojeCivil(), -6)); setAte(hojeCivil()); }
    else if (p === "mes") { setDe(inicioDoMes()); setAte(hojeCivil()); }
    else if (p === "mesPassado") { const [i, f] = mesPassadoRange(); setDe(i); setAte(f); }
  }

  // Busca sob demanda: "Todas as Contas" chama a API uma vez por conta ativa (em
  // paralelo) e soma os 5 saldos + concatena os movimentos, marcados com o banco
  // de origem. Uma conta só faz a chamada de sempre. Também busca o período
  // ANTERIOR de mesma duração, só pra variação % dos KPIs de entrada/saída.
  async function buscarUm(alvoContaId, deB, ateB, estB) {
    if (alvoContaId === "all") {
      const rs = await Promise.all(contasAtivas.map((c) => api.finMovimentacao({ contaId: c.id, de: deB, ate: ateB, estornados: estB })));
      const base = { saldoAnterior: 0, creditos: 0, debitos: 0, saldoAtual: 0, saldoConferido: 0, movimentos: [] };
      rs.forEach((r, i) => {
        if (!r) return;
        base.saldoAnterior += r.saldoAnterior; base.creditos += r.creditos; base.debitos += r.debitos;
        base.saldoAtual += r.saldoAtual; base.saldoConferido += r.saldoConferido;
        base.movimentos.push(...r.movimentos.map((m) => ({ ...m, banco: contasAtivas[i].banco, contaNome: contasAtivas[i].nome })));
      });
      return base;
    }
    const r = await api.finMovimentacao({ contaId: alvoContaId, de: deB, ate: ateB, estornados: estB });
    const conta = contaById[alvoContaId];
    return r ? { ...r, movimentos: r.movimentos.map((m) => ({ ...m, banco: conta?.banco, contaNome: conta?.nome })) } : r;
  }

  async function buscar(filtros) {
    if (filtros.contaId !== "all" && !filtros.contaId) { setErro(t("financeiro.mov.selecioneConta")); return; }
    if (!filtros.de || !filtros.ate) { setErro(t("financeiro.mov.informePeriodo")); return; }
    if (filtros.de > filtros.ate) { setErro(t("financeiro.mov.periodoInvalido")); return; }
    setBuscando(true);
    try {
      const dias = diasEntre(filtros.de, filtros.ate);
      const deAnterior = addDias(filtros.de, -dias);
      const ateAnterior = addDias(filtros.de, -1);
      const [r, rAnterior] = await Promise.all([
        buscarUm(filtros.contaId, filtros.de, filtros.ate, filtros.estornados),
        buscarUm(filtros.contaId, deAnterior, ateAnterior, false),
      ]);
      setResultado(r);
      setAnterior(rAnterior);
      setAplicado(filtros);
      setErro("");
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setBuscando(false);
    }
  }
  function filtrar(e) {
    e?.preventDefault();
    buscar({ contaId, de, ate, estornados: incluirEstornados });
  }
  async function refiltrar() {
    if (aplicado) await buscar(aplicado);
    setFechamentos(await api.finListFechamentos());
  }
  function limparFiltros() {
    setContaId("all"); aplicarPill("mes"); setIncluirEstornados(false);
    setTipoChip("todos"); setConciliacaoChip("todos"); setBusca("");
    buscar({ contaId: "all", de: inicioDoMes(), ate: hojeCivil(), estornados: false });
  }

  async function estornar(l) {
    setErro("");
    try { await api.finEstornarLancamento(l.id); await refiltrar(); } catch (e) { setErro(translateError(e, t)); }
  }
  async function alternarConferido(l) {
    setErro("");
    try { await api.finDefinirConferido(l.id, l.conferido !== 1); await refiltrar(); } catch (e) { setErro(translateError(e, t)); }
  }
  async function exportar(formato) {
    setExportAberto(false);
    try {
      await api.finExportMovimentacao({ contaId: aplicado?.contaId, de: aplicado?.de, ate: aplicado?.ate, estornados: aplicado?.estornados, formato, lang });
    } catch (e) {
      setErro(translateError(e, t));
    }
  }

  // Chips de Tipo/Conciliação e busca textual - filtro em memória, sem nova
  // chamada ao servidor (o que já veio da busca é o universo disponível).
  const filtrados = useMemo(() => {
    if (!resultado) return [];
    const termo = busca.trim().toLowerCase();
    return resultado.movimentos.filter((m) => {
      if (tipoChip === "entradas" && m.tipo !== "receber") return false;
      if (tipoChip === "saidas" && m.tipo !== "pagar") return false;
      if (conciliacaoChip === "conciliados" && m.conferido !== 1) return false;
      if (conciliacaoChip === "naoConciliados" && (m.conferido === 1 || m.estornado)) return false;
      if (!termo) return true;
      const alvo = [m.descricao, nomeContraparte(m), m.numero, String((m.valor_cents || 0) / 100)].join(" ").toLowerCase();
      return alvo.includes(termo);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, [resultado, tipoChip, conciliacaoChip, busca, contatoById]);

  // Agrupa por data (mais recente primeiro), com cabeçalho "Hoje"/"Ontem"/data
  // por extenso - mesmo raciocínio de agrupamento por dia de um extrato bancário.
  const grupos = useMemo(() => {
    const ordenado = [...filtrados].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    const porData = new Map();
    for (const m of ordenado) {
      if (!porData.has(m.data)) porData.set(m.data, []);
      porData.get(m.data).push(m);
    }
    const hoje = hojeCivil();
    const ontem = addDias(hoje, -1);
    const fmt = new Intl.DateTimeFormat(lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "pt-BR", { day: "numeric", month: "long" });
    return [...porData.entries()].map(([data, itens]) => {
      let rotulo;
      if (data === hoje) rotulo = t("financeiro.movimentacao.grupoHoje");
      else if (data === ontem) rotulo = t("financeiro.movimentacao.grupoOntem");
      else {
        const [y, m, d] = data.split("-").map(Number);
        rotulo = fmt.format(new Date(y, m - 1, d));
      }
      return { data, rotulo, itens };
    });
  }, [filtrados, lang, t]);

  const variacaoPct = (atual, ant) => (ant ? Math.round(((atual - ant) / ant) * 1000) / 10 : null);
  const pctEntradas = resultado && anterior ? variacaoPct(resultado.creditos, anterior.creditos) : null;
  const pctSaidas = resultado && anterior ? variacaoPct(resultado.debitos, anterior.debitos) : null;
  const saldoLiquido = resultado ? resultado.creditos - resultado.debitos : 0;
  const anoMesAte = aplicado?.ate?.slice(0, 7);
  const mesFechadoStatus = anoMesAte ? fechadoSet.has(anoMesAte) : false;
  const pendenciasConciliacao = resultado ? resultado.movimentos.filter((m) => !m.estornado && m.status === "finalizado" && m.conferido !== 1).length : 0;

  const rotuloTipoLanc = (m) => (m.tipo === "receber" ? t("financeiro.movimentacao.entrada") : t("financeiro.movimentacao.saida"));
  const rotuloStatus = (m) => {
    if (m.estornado) return t("financeiro.movimentacao.statusEstornado");
    if (m.status === "finalizado") return t("financeiro.movimentacao.statusConcluido");
    return t("financeiro.movimentacao.statusPendente");
  };

  if (carregando) return <div className="fin-loading">{t("common.loading")}</div>;

  return (
    <div className="fin-movimentacao">
      <div className="contatos-header">
        <div>
          <h2 className="contatos-titulo">{t("financeiro.movimentacao.titulo")}</h2>
          <p className="contatos-contador">{t("financeiro.movimentacao.subtitulo")}</p>
        </div>
        <div className="contatos-header-acoes">
          <div className="contas-export">
            <button type="button" className="btn-secondary btn-small" onClick={() => setExportAberto((v) => !v)} disabled={!resultado}>
              <IconDownload /> {t("financeiro.movimentacao.exportar")}
            </button>
            {exportAberto && (
              <div className="dropdown">
                <div className="dropdown-item" onClick={() => exportar("csv")}>{t("financeiro.movimentacao.exportarCsv")}</div>
                <div className="dropdown-item" onClick={() => exportar("pdf")}>{t("financeiro.movimentacao.exportarPdf")}</div>
              </div>
            )}
          </div>
          <button type="button" className="btn-secondary btn-small" onClick={() => setConciliacaoAberta(true)}>
            <IconLock /> {t("financeiro.movimentacao.conciliacaoFechamento")}
          </button>
          <button type="button" className="recurrence-btn-primary" onClick={() => setManualAberto(true)}>
            <IconPlus /> {t("financeiro.manual.titulo")}
          </button>
        </div>
      </div>

      {resultado && (
        <div className="fin-kpis">
          <div className="fin-kpi fin-kpi-receber">
            <span className="fin-kpi-label">{t("financeiro.movimentacao.kpiEntradas")}</span>
            <span className="fin-kpi-value">{formatCents(resultado.creditos, lang)}</span>
            {pctEntradas !== null && <span className="contas-kpi-badge">{pctEntradas >= 0 ? "+" : ""}{pctEntradas}%</span>}
          </div>
          <div className="fin-kpi fin-kpi-pagar">
            <span className="fin-kpi-label">{t("financeiro.movimentacao.kpiSaidas")}</span>
            <span className="fin-kpi-value">{formatCents(resultado.debitos, lang)}</span>
            {pctSaidas !== null && <span className="contas-kpi-badge">{pctSaidas >= 0 ? "+" : ""}{pctSaidas}%</span>}
          </div>
          <div className="fin-kpi">
            <span className="fin-kpi-label">{t("financeiro.movimentacao.kpiSaldoLiquido")}</span>
            <span className={"fin-kpi-value " + (saldoLiquido < 0 ? "fin-pagar" : "fin-receber")}>{formatCents(saldoLiquido, lang)}</span>
          </div>
          <div className="fin-kpi">
            <span className="fin-kpi-label">{t("financeiro.movimentacao.kpiFechamento")}</span>
            <span className={"mov-fechamento-pill " + (mesFechadoStatus ? "mov-fechamento-pill-fechado" : pendenciasConciliacao > 0 ? "mov-fechamento-pill-pendencias" : "mov-fechamento-pill-aberto")}>
              {mesFechadoStatus
                ? t("financeiro.movimentacao.mesConciliado")
                : pendenciasConciliacao > 0
                  ? t("financeiro.movimentacao.mesPendencias", { count: pendenciasConciliacao })
                  : t("financeiro.movimentacao.mesAberto")}
            </span>
          </div>
        </div>
      )}

      <form className="fin-mov-filtros" onSubmit={filtrar}>
        <label className="fin-field fin-mov-conta">
          <span>{t("financeiro.contas.nome")}</span>
          {contasAtivas.length === 0 ? (
            <span className="fin-cad-hint">{t("financeiro.importar.semContas")}</span>
          ) : (
            <SearchSelect value={contaId} onChange={setContaId} options={contaOpts} placeholder={t("financeiro.contas.nome")} />
          )}
        </label>
        <div className="fin-field">
          <span>{t("financeiro.movimentacao.periodo")}</span>
          <div className="timing-toggle">
            {PILLS.map((p) => (
              <button key={p} type="button" className={"timing-toggle-btn" + (pill === p ? " active" : "")} onClick={() => aplicarPill(p)}>
                {t("financeiro.movimentacao.pill." + p)}
              </button>
            ))}
          </div>
        </div>
        {pill === "personalizado" && (
          <>
            <label className="fin-field">
              <span>{t("financeiro.mov.dataInicio")}</span>
              <input type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} />
            </label>
            <label className="fin-field">
              <span>{t("financeiro.mov.dataFim")}</span>
              <input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} />
            </label>
          </>
        )}
        <div className="fin-field fin-mov-acao">
          <span aria-hidden="true">&nbsp;</span>
          <button type="submit" className="btn-primary fin-mov-filtrar" disabled={buscando || contasAtivas.length === 0}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2" d="M10 4a6 6 0 104.9 9.5l4.8 4.8m-4.9-4.8A6 6 0 0010 4z" />
            </svg>
            {buscando ? t("common.loading") : t("financeiro.mov.filtrar")}
          </button>
        </div>
      </form>

      {contaSel && (detalheConta(contaSel) || contaSel.banco) && (
        <div className="fin-conta-detalhe fin-mov-conta-info">
          {[contaSel.banco, detalheConta(contaSel)].filter(Boolean).join(" · ")}
        </div>
      )}

      {resultado && (
        <div className="fin-mov-filtros mov-filtros-chips">
          <label className="contatos-busca mov-busca">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t("financeiro.movimentacao.buscarPlaceholder")} />
          </label>
          <div className="timing-toggle">
            {["todos", "entradas", "saidas"].map((c) => (
              <button key={c} type="button" className={"timing-toggle-btn" + (tipoChip === c ? " active" : "")} onClick={() => setTipoChip(c)}>
                {t("financeiro.movimentacao.tipoChip." + c)}
              </button>
            ))}
          </div>
          <div className="timing-toggle">
            {["todos", "conciliados", "naoConciliados"].map((c) => (
              <button key={c} type="button" className={"timing-toggle-btn" + (conciliacaoChip === c ? " active" : "")} onClick={() => setConciliacaoChip(c)}>
                {t("financeiro.movimentacao.conciliacaoChip." + c)}
              </button>
            ))}
          </div>
          <label className="contas-principal-toggle mov-toggle-estornados">
            <span className="addon-toggle">
              <input type="checkbox" checked={incluirEstornados} onChange={(e) => { setIncluirEstornados(e.target.checked); buscar({ contaId, de, ate, estornados: e.target.checked }); }} />
              <span className="addon-toggle-track"><span className="addon-toggle-thumb" /></span>
            </span>
            {t("financeiro.mov.incluirEstornados")}
          </label>
        </div>
      )}

      {erro && <div className="fin-error">{erro}</div>}

      {manualAberto && (
        <LancamentoManualModal onClose={() => setManualAberto(false)} onCriado={() => { if (aplicado) refiltrar(); }} />
      )}
      {editando && (
        <EditarLancamentoModal lancamento={editando} onClose={() => setEditando(null)} onSalvo={refiltrar} />
      )}
      {conciliacaoAberta && (
        <ConciliacaoFechamentoDrawer
          resultado={resultado} de={aplicado?.de} ate={aplicado?.ate} lang={lang} catById={catById}
          onClose={() => setConciliacaoAberta(false)} onChanged={refiltrar}
        />
      )}

      {!resultado && !erro && (
        <div className="contas-empty">
          <span className="contas-empty-icone"><IconHistorico /></span>
          <h3 className="contas-empty-titulo">{t("financeiro.movimentacao.emptyBuscaTitulo")}</h3>
          <p className="contas-empty-texto">{t("financeiro.movimentacao.emptyBuscaTexto")}</p>
          <button type="button" className="recurrence-btn-primary" onClick={() => setManualAberto(true)}>
            <IconPlus /> {t("financeiro.movimentacao.criarLancamento")}
          </button>
        </div>
      )}

      {resultado && filtrados.length === 0 && (
        <div className="contas-empty">
          <span className="contas-empty-icone"><IconHistorico /></span>
          <h3 className="contas-empty-titulo">{t("financeiro.movimentacao.emptyVaziaTitulo")}</h3>
          <p className="contas-empty-texto">{t("financeiro.movimentacao.emptyVaziaTexto")}</p>
          <div className="cobr-form-footer" style={{ justifyContent: "center" }}>
            <button type="button" className="recurrence-btn-ghost" onClick={limparFiltros}>{t("financeiro.movimentacao.limparFiltros")}</button>
            <button type="button" className="recurrence-btn-primary" onClick={() => setManualAberto(true)}>
              <IconPlus /> {t("financeiro.movimentacao.criarLancamento")}
            </button>
          </div>
        </div>
      )}

      {resultado && grupos.map((g) => (
        <div key={g.data} className="mov-grupo">
          <h3 className="mov-grupo-data">{g.rotulo}</h3>
          <div className="fin-table-wrap">
            <table className="fin-table contatos-table">
              <thead>
                <tr>
                  <th>{t("financeiro.mov.data")}</th>
                  <th>{t("financeiro.col.descricao")}</th>
                  <th>{t("financeiro.movimentacao.colConta")}</th>
                  <th>{t("financeiro.movimentacao.colTipo")}</th>
                  <th className="fin-num">{t("financeiro.col.valor")}</th>
                  <th>{t("financeiro.movimentacao.colConciliacao")}</th>
                  <th>{t("financeiro.movimentacao.colStatus")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {g.itens.map((l) => (
                  <tr key={l.id} className={l.estornado ? "fin-mov-estornado" : ""}>
                    <td>{l.data?.split("-").reverse().join("/")}</td>
                    <td>
                      <div className="contatos-cell-contato">
                        <span className="contatos-cell-nome">{l.descricao || "-"}</span>
                        <span className="contatos-cell-email">
                          {nomeContraparte(l)}{catById[l.category_id] ? ` • ${catById[l.category_id].nome}` : ""}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="contas-badge-banco">
                        <BancoBadge banco={l.banco} size={20} />
                        {l.contaNome || "-"}
                      </span>
                    </td>
                    <td><span className={"contatos-badge-tipo " + (l.tipo === "receber" ? "mov-badge-tipo-entrada" : "mov-badge-tipo-saida")}>{rotuloTipoLanc(l)}</span></td>
                    <td className={"fin-num " + (l.tipo === "receber" ? "fin-receber" : "fin-pagar")}>
                      {l.tipo === "receber" ? "+" : "-"} {formatCents(liquidoDoLancamento(l), lang)}
                    </td>
                    <td>
                      {l.estornado || l.status !== "finalizado" ? (
                        <span className="mov-conciliacao-badge mov-conciliacao-na">-</span>
                      ) : l.conferido === 1 ? (
                        <span className="mov-conciliacao-badge mov-conciliacao-ok">✓ {t("financeiro.movimentacao.conciliado")}</span>
                      ) : (
                        <span className="mov-conciliacao-badge mov-conciliacao-pendente">• {t("financeiro.movimentacao.naoConciliado")}</span>
                      )}
                    </td>
                    <td><span className={"mov-status-pill " + (l.estornado ? "mov-status-pill-estornado" : l.status === "finalizado" ? "mov-status-pill-concluido" : "mov-status-pill-pendente")}>{rotuloStatus(l)}</span></td>
                    <td className="contatos-cell-acoes">
                      {!l.estornado && (
                        <MovAcoesKebab
                          l={l} t={t}
                          onEditar={() => setEditando(l)}
                          onConciliar={l.status === "finalizado" ? () => alternarConferido(l) : null}
                          onEstornar={l.status === "finalizado" ? () => estornar(l) : null}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// Kebab de ações de uma linha do extrato - mesmo padrão position:fixed de
// ContaAcoesKebab (contaCardParts.jsx), mas com o conjunto de ações da
// Movimentação (Editar/Conciliar Manualmente/Estornar), então não reaproveita
// o componente pronto (que é específico de conta bancária), só o desenho.
function MovAcoesKebab({ l, t, onEditar, onConciliar, onEstornar }) {
  const [aberto, setAberto] = useState(false);
  const [coords, setCoords] = useState(null);

  function abrir(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setAberto((v) => !v);
  }

  useEffect(() => {
    if (!aberto) return;
    function onDoc(e) {
      if (!e.target.closest(".mov-acoes-kebab-menu") && !e.target.closest(".mov-acoes-kebab-btn")) setAberto(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [aberto]);

  return (
    <>
      <button type="button" className="row-menu-btn mov-acoes-kebab-btn" onClick={abrir} aria-label={t("financeiro.movimentacao.acoes")}>
        <IconKebab />
      </button>
      {aberto && coords && (
        <div className="dropdown mov-acoes-kebab-menu" style={{ position: "fixed", top: coords.top, right: coords.right }}>
          <div className="dropdown-item" onClick={() => { setAberto(false); onEditar(); }}>{t("financeiro.movimentacao.menuEditar")}</div>
          {onConciliar && <div className="dropdown-item" onClick={() => { setAberto(false); onConciliar(); }}>{l.conferido === 1 ? t("financeiro.movimentacao.menuDesconciliar") : t("financeiro.movimentacao.menuConciliar")}</div>}
          {onEstornar && (
            <>
              <div className="dropdown-divider" />
              <div className="dropdown-item danger" onClick={() => { setAberto(false); onEstornar(); }}>{t("financeiro.acao.estornar")}</div>
            </>
          )}
        </div>
      )}
    </>
  );
}
