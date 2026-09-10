import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents } from "./dinheiro.js";
import { comCodigo } from "./rotulo.js";
import FluxoCaixaLancamentosModal from "./FluxoCaixaLancamentosModal.jsx";

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDiasCivil(civil, n) {
  const [y, m, d] = civil.split("-").map(Number);
  const alvo = new Date(y, m - 1, d + n);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(alvo.getDate()).padStart(2, "0")}`;
}
function addMesesCivil(civil, n) {
  const [y, m, d] = civil.split("-").map(Number);
  const alvo = new Date(y, m - 1 + n, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ultimoDia)).padStart(2, "0")}`;
}
function ultimoDiaMes(civil) {
  const [y, m] = civil.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}
function periodoAnoAtual() {
  const ano = new Date().getFullYear();
  return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
}
function periodoMesAtual() {
  const hoje = hojeCivil();
  return { de: hoje.slice(0, 8) + "01", ate: ultimoDiaMes(hoje) };
}
function periodoUltimoTrimestre() {
  const hoje = hojeCivil();
  return { de: addMesesCivil(hoje.slice(0, 8) + "01", -2), ate: ultimoDiaMes(hoje) };
}
// Período imediatamente anterior, de mesma duração (pra "Comparar Períodos") -
// ex.: 01/01 a 31/03 (90 dias) vira 02/10 a 31/12 do ano anterior.
function periodoAnterior(de, ate) {
  const dias = (new Date(ate) - new Date(de)) / 86400000;
  const anteAte = addDiasCivil(de, -1);
  const anteDe = addDiasCivil(anteAte, -dias);
  return { de: anteDe, ate: anteAte };
}

function IconDownload({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
function IconChart({ size = 28 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10M10 20V4M16 20v-7M4 20h16" />
    </svg>
  );
}
function IconChevron({ aberto, size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: aberto ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// Deriva a cascata inteira (subtotais) a partir dos totais brutos por grupo
// que o servidor devolve (calculos.montarDreCascata) - a montagem (o que
// soma/subtrai) é apresentação, mesma separação de responsabilidade do
// resto do módulo financeiro.
function calcularDerivados(totais) {
  const receitaBruta = totais.receitaProdutos + totais.receitaServicos + totais.receitaOutras;
  const receitaLiquida = receitaBruta - totais.impostosSobreVendas;
  const lucroBruto = receitaLiquida - totais.cpv;
  const despesasOperacionais = totais.despesaPessoal + totais.despesaAdministrativa + totais.despesaComercial + totais.despesaOutrasOperacionais;
  const ebitda = lucroBruto - despesasOperacionais;
  const resultadoFinanceiro = totais.receitaFinanceira - totais.despesaFinanceira;
  const lucroLiquido = ebitda + resultadoFinanceiro;
  return { ...totais, receitaBruta, receitaLiquida, lucroBruto, despesasOperacionais, ebitda, resultadoFinanceiro, lucroLiquido };
}
function variacaoPct(atual, anterior) {
  if (!anterior) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export default function DREView() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();
  const tc = (chave, vars) => t("financeiro.dre.cascata." + chave, vars);

  const anoAtual = useMemo(() => periodoAnoAtual(), []);
  const [de, setDe] = useState(anoAtual.de);
  const [ate, setAte] = useState(anoAtual.ate);
  const [centroCustoId, setCentroCustoId] = useState("");
  const [contaId, setContaId] = useState("");
  const [exibirAv, setExibirAv] = useState(true);
  const [compararAtivo, setCompararAtivo] = useState(false);

  const [centros, setCentros] = useState([]);
  const [contas, setContas] = useState([]);
  const [dre, setDre] = useState(null);
  const [dreAnterior, setDreAnterior] = useState(null);
  const [erro, setErro] = useState("");
  const [exportAberto, setExportAberto] = useState(false);
  const exportRef = useRef(null);
  const [drill, setDrill] = useState(null); // { grupo, grupoLabel }
  const [expandido, setExpandido] = useState({ receitaBruta: true, deducoes: true, cpv: true, despesasOperacionais: true, resultadoFinanceiro: true });

  useEffect(() => {
    Promise.all([api.finListCentrosCusto(), api.finListContas()])
      .then(([ccs, cos]) => { setCentros(ccs); setContas(cos); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const filtros = { de, ate, centroCustoId: centroCustoId || undefined, contaId: contaId || undefined };
    api.finGetDreCascata(filtros).then((d) => { setDre(d); setErro(""); }).catch((err) => setErro(translateError(err, t)));
    if (compararAtivo) {
      const ant = periodoAnterior(de, ate);
      api.finGetDreCascata({ ...filtros, de: ant.de, ate: ant.ate }).then(setDreAnterior).catch(() => setDreAnterior(null));
    } else {
      setDreAnterior(null);
    }
  }, [de, ate, centroCustoId, contaId, compararAtivo, t]);

  useEffect(() => {
    if (!exportAberto) return;
    function onDoc(e) { if (exportRef.current && !exportRef.current.contains(e.target)) setExportAberto(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [exportAberto]);

  const derivados = useMemo(() => (dre ? calcularDerivados(dre) : null), [dre]);
  const derivadosAnterior = useMemo(() => (dreAnterior ? calcularDerivados(dreAnterior) : null), [dreAnterior]);

  function toggleBloco(chave) {
    setExpandido((e) => ({ ...e, [chave]: !e[chave] }));
  }

  function aplicarAtalho(fn) {
    const p = fn();
    setDe(p.de);
    setAte(p.ate);
  }

  async function exportar(formato) {
    setExportAberto(false);
    try {
      await api.finExportDre({ de, ate, centroCustoId: centroCustoId || undefined, contaId: contaId || undefined, formato, lang });
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  function verLancamentos(grupo, labelChave) {
    setDrill({ grupo, grupoLabel: tc(labelChave) });
  }

  const centroOpts = useMemo(() => centros.filter((c) => c.tipo !== "sintetico"), [centros]);

  if (erro) return <div className="fin-error">{erro}</div>;
  if (!derivados) return <div className="fin-loading">{t("common.loading")}</div>;

  const d = derivados;
  const da = derivadosAnterior;
  const semDados = d.receitaBruta === 0 && d.despesasOperacionais === 0 && d.cpv === 0 && d.impostosSobreVendas === 0 && d.resultadoFinanceiro === 0;
  const margemBruta = d.receitaBruta ? (d.lucroBruto / d.receitaBruta) * 100 : 0;
  const margemEbitda = d.receitaBruta ? (d.ebitda / d.receitaBruta) * 100 : 0;
  const margemLiquida = d.receitaBruta ? (d.lucroLiquido / d.receitaBruta) * 100 : 0;

  // Linha de cascata reutilizável - subtotal (com chevron, quando `filhos`
  // existe) ou folha (com "Ver lançamentos", quando `grupo` existe).
  function Linha({ chave, valor, nivel, tipo, temFilhos, aberto, grupo }) {
    const av = d.receitaBruta ? (valor / d.receitaBruta) * 100 : 0;
    const varAtual = tipo === "subtotal" || tipo === "final" ? valor : valor;
    const varAnterior = da ? (chave === "receitaBruta" ? da.receitaBruta
      : chave === "receitaLiquida" ? da.receitaLiquida
      : chave === "lucroBruto" ? da.lucroBruto
      : chave === "despesasOperacionais" ? da.despesasOperacionais
      : chave === "ebitda" ? da.ebitda
      : chave === "resultadoFinanceiro" ? da.resultadoFinanceiro
      : chave === "lucroLiquido" ? da.lucroLiquido
      : chave === "deducoes" ? -da.impostosSobreVendas
      : chave === "cpv" ? -da.cpv
      : null) : null;
    const variacao = compararAtivo && varAnterior !== null ? variacaoPct(varAtual, varAnterior) : undefined;
    return (
      <tr className={"dre-linha" + (tipo === "subtotal" ? " dre-linha-subtotal" : "") + (tipo === "final" ? " dre-linha-final" : "") + (nivel === 1 ? " dre-linha-filho" : "")}>
        <td className="dre-col-label" onClick={temFilhos ? () => toggleBloco(chave) : undefined} style={temFilhos ? { cursor: "pointer" } : undefined}>
          {temFilhos && <span className="dre-chevron"><IconChevron aberto={aberto} /></span>}
          {tc(chave)}
        </td>
        <td className={"fin-num " + (valor < 0 ? "fin-pagar" : valor > 0 ? "fin-receber" : "")}>{formatCents(valor, lang)}</td>
        {exibirAv && <td className="fin-num dre-col-av">{av.toFixed(1)}%</td>}
        {compararAtivo && (
          <td className={"fin-num dre-col-variacao " + (variacao == null ? "" : variacao >= 0 ? "fin-receber" : "fin-pagar")}>
            {variacao == null ? "-" : (variacao >= 0 ? "+" : "") + variacao.toFixed(1) + "%"}
          </td>
        )}
        <td className="dre-col-acao">
          {grupo && <button type="button" className="btn-ghost btn-small" onClick={() => verLancamentos(grupo, chave)}>{tc("verLancamentos")}</button>}
        </td>
      </tr>
    );
  }

  return (
    <div className="fin-dre fin-dre-cascata">
      <div className="contatos-header">
        <div>
          <h2 className="contatos-titulo">{tc("headerTitulo")}</h2>
          <p className="contatos-contador">{tc("headerSubtitulo")}</p>
        </div>
        <div className="contatos-header-acoes">
          <select className="dre-regime-select" defaultValue="caixa">
            <option value="caixa">{tc("regimeCaixa")}</option>
            <option value="competencia" disabled>{tc("regimeCompetencia")}</option>
          </select>
          <button type="button" className={"btn-secondary btn-small" + (compararAtivo ? " tit-filtros-btn-ativo" : "")} onClick={() => setCompararAtivo((v) => !v)}>
            {tc("compararPeriodos")}
          </button>
          <div className="contatos-export" ref={exportRef}>
            <button type="button" className="btn-secondary btn-small" onClick={() => setExportAberto((v) => !v)}>
              <IconDownload /> {tc("exportar")}
            </button>
            {exportAberto && (
              <div className="dropdown">
                <div className="dropdown-item" onClick={() => exportar("csv")}>{tc("exportarCsv")}</div>
                <div className="dropdown-item" onClick={() => exportar("pdf")}>{tc("exportarPdf")}</div>
                <div className="dropdown-item" onClick={() => exportar("xlsx")}>{tc("exportarExcel")}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="timing-toggle">
        <button type="button" className="timing-toggle-btn" onClick={() => aplicarAtalho(periodoAnoAtual)}>{tc("periodoAnoAtual")}</button>
        <button type="button" className="timing-toggle-btn" onClick={() => aplicarAtalho(periodoUltimoTrimestre)}>{tc("periodoUltimoTrimestre")}</button>
        <button type="button" className="timing-toggle-btn" onClick={() => aplicarAtalho(periodoMesAtual)}>{tc("periodoMesAtual")}</button>
      </div>

      <div className="fin-toolbar">
        <label className="fin-field">
          <span>{t("financeiro.periodo.de")}</span>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="fin-field">
          <span>{t("financeiro.periodo.ate")}</span>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
        <label className="fin-field">
          <span>{tc("todosCentros")}</span>
          <select value={centroCustoId} onChange={(e) => setCentroCustoId(e.target.value)}>
            <option value="">{tc("todosCentros")}</option>
            {centroOpts.map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
          </select>
        </label>
        <label className="fin-field">
          <span>{tc("todasContas")}</span>
          <select value={contaId} onChange={(e) => setContaId(e.target.value)}>
            <option value="">{tc("todasContas")}</option>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="fin-field dre-av-toggle">
          <span>{tc("exibirAv")}</span>
          <span className="addon-toggle">
            <input type="checkbox" checked={exibirAv} onChange={() => setExibirAv((v) => !v)} />
            <span className="addon-toggle-track"><span className="addon-toggle-thumb" /></span>
          </span>
        </label>
      </div>

      {erro && <div className="fin-error">{erro}</div>}

      <div className="fin-kpis">
        <div className="fin-kpi">
          <span className="fin-kpi-label">{tc("kpiReceitaBruta")}</span>
          <span className="fin-kpi-value">{formatCents(d.receitaBruta, lang)}</span>
        </div>
        <div className="fin-kpi fin-kpi-receber">
          <span className="fin-kpi-label">{tc("kpiLucroBruto")}</span>
          <span className="fin-kpi-value">{formatCents(d.lucroBruto, lang)}</span>
          <span className="fin-count-pill">{margemBruta.toFixed(1)}%</span>
        </div>
        <div className="fin-kpi">
          <span className="fin-kpi-label">{tc("kpiEbitda")}</span>
          <span className="fin-kpi-value">{formatCents(d.ebitda, lang)}</span>
          <span className="fin-count-pill">{margemEbitda.toFixed(1)}%</span>
        </div>
        <div className={"fin-kpi " + (d.lucroLiquido >= 0 ? "fin-kpi-receber" : "fin-kpi-alerta")}>
          <span className="fin-kpi-label">{tc("kpiLucroLiquido")}</span>
          <span className="fin-kpi-value">{formatCents(d.lucroLiquido, lang)}</span>
          <span className="fin-count-pill">{margemLiquida.toFixed(1)}%</span>
        </div>
      </div>

      {semDados ? (
        <div className="contas-empty">
          <span className="contas-empty-icone"><IconChart /></span>
          <h3 className="contas-empty-titulo">{tc("emptyTitulo")}</h3>
          <p className="contas-empty-texto">{tc("emptyTexto")}</p>
        </div>
      ) : (
        <div className="fin-table-wrap">
          <table className="fin-table dre-cascata-table">
            <thead>
              <tr>
                <th>{tc("colunaLinha")}</th>
                <th className="fin-num">{tc("colunaValor")}</th>
                {exibirAv && <th className="fin-num">{tc("colunaAv")}</th>}
                {compararAtivo && <th className="fin-num">{tc("variacao")}</th>}
                <th className="dre-col-acao">{tc("colunaAcoes")}</th>
              </tr>
            </thead>
            <tbody>
              <Linha chave="receitaBruta" valor={d.receitaBruta} nivel={0} tipo="subtotal" temFilhos aberto={expandido.receitaBruta} />
              {expandido.receitaBruta && (
                <>
                  <Linha chave="vendasProdutos" valor={d.receitaProdutos} nivel={1} tipo="linha" grupo="receita_produtos" />
                  <Linha chave="prestacaoServicos" valor={d.receitaServicos} nivel={1} tipo="linha" grupo="receita_atendimento" />
                  <Linha chave="outrasReceitas" valor={d.receitaOutras} nivel={1} tipo="linha" grupo="receita_outras" />
                </>
              )}

              <Linha chave="deducoes" valor={-d.impostosSobreVendas} nivel={0} tipo="subtotal" temFilhos aberto={expandido.deducoes} />
              {expandido.deducoes && <Linha chave="impostosVendas" valor={-d.impostosSobreVendas} nivel={1} tipo="linha" grupo="despesa_impostos" />}

              <Linha chave="receitaLiquida" valor={d.receitaLiquida} nivel={0} tipo="subtotal" />

              <Linha chave="cpv" valor={-d.cpv} nivel={0} tipo="subtotal" temFilhos aberto={expandido.cpv} />
              {expandido.cpv && <Linha chave="custosDiretos" valor={-d.cpv} nivel={1} tipo="linha" grupo="custo_servicos_produtos" />}

              <Linha chave="lucroBruto" valor={d.lucroBruto} nivel={0} tipo="subtotal" />

              <Linha chave="despesasOperacionais" valor={-d.despesasOperacionais} nivel={0} tipo="subtotal" temFilhos aberto={expandido.despesasOperacionais} />
              {expandido.despesasOperacionais && (
                <>
                  <Linha chave="despesaPessoal" valor={-d.despesaPessoal} nivel={1} tipo="linha" grupo="despesa_pessoal" />
                  <Linha chave="despesaAdministrativa" valor={-d.despesaAdministrativa} nivel={1} tipo="linha" grupo={["despesa_administrativa", "despesa_operacional"]} />
                  <Linha chave="despesaComercial" valor={-d.despesaComercial} nivel={1} tipo="linha" grupo="despesa_comercial" />
                  <Linha chave="despesaOutrasOperacionais" valor={-d.despesaOutrasOperacionais} nivel={1} tipo="linha" grupo="despesa_outras" />
                </>
              )}

              <Linha chave="ebitda" valor={d.ebitda} nivel={0} tipo="subtotal" />

              <Linha chave="resultadoFinanceiro" valor={d.resultadoFinanceiro} nivel={0} tipo="subtotal" temFilhos aberto={expandido.resultadoFinanceiro} />
              {expandido.resultadoFinanceiro && (
                <>
                  <Linha chave="receitasFinanceiras" valor={d.receitaFinanceira} nivel={1} tipo="linha" grupo="receita_financeira" />
                  <Linha chave="despesasFinanceiras" valor={-d.despesaFinanceira} nivel={1} tipo="linha" grupo="despesa_financeira" />
                </>
              )}

              <Linha chave="lucroLiquido" valor={d.lucroLiquido} nivel={0} tipo="final" />
            </tbody>
          </table>
        </div>
      )}

      {drill && (
        <FluxoCaixaLancamentosModal
          grupo={drill.grupo} grupoLabel={drill.grupoLabel} colunaLabel={`${de} - ${ate}`}
          de={de} ate={ate} contaId={contaId || null} centroCustoId={centroCustoId || null}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}
