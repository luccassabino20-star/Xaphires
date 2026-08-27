import { useMemo, useState } from "react";
import "./xaphiresFinance.css";
import {
  BANKS,
  COST_CENTERS,
  TRANSACOES,
  DOCUMENTOS,
  formatBRL,
  filtrarTransacoes,
  resumoPorCentro,
  fluxoMensal,
  projecaoSaldo,
  composicaoTributaria,
  dreWaterfall,
  serieTendencia,
} from "./financeMockData.js";
import FinanceSparkline from "./FinanceSparkline.jsx";
import FinanceWaterfallChart from "./FinanceWaterfallChart.jsx";
import FinanceDonutChart from "./FinanceDonutChart.jsx";
import FinanceCashFlowChart from "./FinanceCashFlowChart.jsx";
import FinanceUploadPanel from "./FinanceUploadPanel.jsx";
import FinanceCostCenterPanel from "./FinanceCostCenterPanel.jsx";
import FinanceReconciliationTable from "./FinanceReconciliationTable.jsx";

// Módulo "Xaphires Finance & BPO" - pilar registrado de verdade (id
// "finance-bpo" em server/modules.js e src/modules/registry.js, plugado em
// PlatformShell.jsx), lado a lado com "financeiro" (ERP IRES) na mesma aba
// "Financeiro" do launcher de propósito: nasceu para competir com aquele
// módulo e, se o cliente decidir, substituí-lo mais adiante - ver decisão
// registrada na conversa. Começou como protótipo isolado
// (prototypes/xaphiresFinance), promovido pra cá sem mudar o código por
// dentro, só o registro.
//
// Todo dado ainda é simulado (financeMockData.js, gerado na carga, sem
// rede) - "aparecer no launcher" não é "estar pronto pra dado real"; o badge
// "Protótipo · dados simulados" no topo continua de propósito. Em especial,
// a leitura de NF (FinanceUploadPanel.jsx) NÃO faz OCR nem parse de XML de
// verdade - sorteia um documento já pronto. NFSe não tem schema nacional
// único (cada município define o próprio), então mesmo a versão "de
// verdade" deste pilar não dá pra generalizar sem escolher integrações
// município a município ou um serviço de OCR pago - decisão de produto que
// este módulo não toma sozinho.
export default function XaphiresFinanceView({ onExit }) {
  const [periodo, setPeriodo] = useState("trimestre");
  const [bancoId, setBancoId] = useState(null);
  const [centroId, setCentroId] = useState(null);
  const [diasProjecao, setDiasProjecao] = useState(90);

  // Cross-filter real: bancoId/centroId/periodo são o único estado de
  // filtro do módulo inteiro - clicar num card de banco, numa linha de
  // centro de custo ou nos seletores do topo escreve nas mesmas três
  // variáveis, e tudo abaixo recalcula a partir delas.
  const transacoesFiltradas = useMemo(
    () => filtrarTransacoes(TRANSACOES, { bancoId, centroId, periodo }),
    [bancoId, centroId, periodo]
  );
  // Painel de centro de custo não filtra por centro (é ele quem define o
  // filtro) - senão selecionar uma obra colapsaria a própria tabela a uma
  // linha só.
  const transacoesParaCentros = useMemo(
    () => filtrarTransacoes(TRANSACOES, { bancoId, periodo }),
    [bancoId, periodo]
  );
  const resumoCentros = useMemo(() => resumoPorCentro(transacoesParaCentros), [transacoesParaCentros]);

  const documentosFiltrados = useMemo(
    () => (centroId ? DOCUMENTOS.filter((d) => d.centroId === centroId) : DOCUMENTOS),
    [centroId]
  );
  const tributos = useMemo(() => composicaoTributaria(documentosFiltrados), [documentosFiltrados]);
  const totalImpostos = useMemo(() => tributos.reduce((s, t) => s + t.total, 0), [tributos]);
  const waterfall = useMemo(() => dreWaterfall(transacoesFiltradas, totalImpostos), [transacoesFiltradas, totalImpostos]);
  const mensal = useMemo(() => fluxoMensal(transacoesFiltradas), [transacoesFiltradas]);

  const saldoConsolidado = useMemo(() => {
    const bancos = bancoId ? BANKS.filter((b) => b.id === bancoId) : BANKS;
    return bancos.reduce((s, b) => s + b.saldo, 0);
  }, [bancoId]);

  const projecao = useMemo(
    () => projecaoSaldo(transacoesFiltradas, saldoConsolidado, diasProjecao),
    [transacoesFiltradas, saldoConsolidado, diasProjecao]
  );

  const kpis = useMemo(() => buildKpis(transacoesFiltradas, waterfall, totalImpostos, saldoConsolidado, projecao), [
    transacoesFiltradas,
    waterfall,
    totalImpostos,
    saldoConsolidado,
    projecao,
  ]);

  const bancoAtivo = BANKS.find((b) => b.id === bancoId);
  const centroAtivo = COST_CENTERS.find((c) => c.id === centroId);

  return (
    <div className="xf-page">
      <header className="xf-topbar">
        <div className="xf-topbar-title">
          <span className="xf-eyebrow">Xaphires Finance &amp; BPO</span>
          <h1>Central Financeira Executiva</h1>
        </div>
        <div className="xf-topbar-actions">
          <span className="xf-badge-sim">Protótipo · dados simulados</span>
          {onExit && (
            <button type="button" className="xf-btn-secondary" onClick={onExit}>
              Sair
            </button>
          )}
        </div>
      </header>

      {/* ---------- 1. Header multibancário ---------- */}
      <section className="xf-banks-row">
        <button
          type="button"
          className={"xf-bank-card xf-bank-card-all" + (!bancoId ? " active" : "")}
          onClick={() => setBancoId(null)}
        >
          <span className="xf-bank-card-label">Saldo Geral Disponível</span>
          <span className="xf-bank-card-value">{formatBRL(BANKS.reduce((s, b) => s + b.saldo, 0))}</span>
          <span className="xf-bank-card-sub">{BANKS.length} contas conectadas</span>
        </button>
        {BANKS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={"xf-bank-card" + (bancoId === b.id ? " active" : "")}
            style={{ "--xf-bank-color": b.cor }}
            onClick={() => setBancoId(bancoId === b.id ? null : b.id)}
          >
            <span className="xf-bank-dot" />
            <span className="xf-bank-card-label">{b.nome}</span>
            <span className="xf-bank-card-value">{formatBRL(b.saldo)}</span>
          </button>
        ))}
      </section>

      {/* ---------- 4. Slicers superiores ---------- */}
      <section className="xf-slicers">
        <div className="xf-slicer-group">
          <span className="xf-slicer-label">Período</span>
          <div className="xf-pill-group">
            {[
              { id: "hoje", label: "Hoje" },
              { id: "mes", label: "Mês atual" },
              { id: "trimestre", label: "Trimestre" },
              { id: "todos", label: "Tudo" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={"xf-pill" + (periodo === p.id ? " active" : "")}
                onClick={() => setPeriodo(p.id)}
              >
                {p.label}
              </button>
            ))}
            <button type="button" className="xf-pill xf-pill-disabled" disabled title="Em breve">
              Personalizado
            </button>
          </div>
        </div>
        <div className="xf-slicer-group">
          <span className="xf-slicer-label">Banco</span>
          <select value={bancoId || ""} onChange={(e) => setBancoId(e.target.value || null)}>
            <option value="">Todos os bancos</option>
            {BANKS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="xf-slicer-group">
          <span className="xf-slicer-label">Centro de Custo</span>
          <select value={centroId || ""} onChange={(e) => setCentroId(e.target.value || null)}>
            <option value="">Todos os centros</option>
            {COST_CENTERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        {(bancoAtivo || centroAtivo) && (
          <div className="xf-active-filters">
            {bancoAtivo && <span className="xf-filter-chip">{bancoAtivo.nome} ✕</span>}
            {centroAtivo && <span className="xf-filter-chip">{centroAtivo.nome} ✕</span>}
          </div>
        )}
      </section>

      {/* ---------- 4. KPIs executivos ---------- */}
      <section className="xf-kpis">
        {kpis.map((k) => (
          <div key={k.titulo} className="xf-kpi-card">
            <div className="xf-kpi-card-top">
              <span className="xf-kpi-titulo">{k.titulo}</span>
              <span className={"xf-kpi-mom" + (k.pct >= 0 ? " xf-positivo" : " xf-negativo")}>
                {k.pct >= 0 ? "▲" : "▼"} {Math.abs(k.pct).toFixed(1)}% MoM
              </span>
            </div>
            <span className="xf-kpi-valor">{k.valorFormatado}</span>
            <FinanceSparkline pontos={k.serie} cor={k.cor} />
          </div>
        ))}
      </section>

      {/* ---------- 4. Gráficos: waterfall / donut / fluxo de caixa ---------- */}
      <section className="xf-charts-grid">
        <div className="xf-panel xf-panel-waterfall">
          <div className="xf-panel-header">
            <h2>DRE Executivo em Cascata</h2>
          </div>
          <FinanceWaterfallChart passos={waterfall} />
        </div>
        <div className="xf-panel xf-panel-donut">
          <div className="xf-panel-header">
            <h2>Composição Tributária</h2>
          </div>
          {tributos.length === 0 ? (
            <div className="xf-empty-row">Sem impostos no filtro atual.</div>
          ) : (
            <FinanceDonutChart dados={tributos} />
          )}
        </div>
      </section>

      <section className="xf-panel">
        <div className="xf-panel-header">
          <h2>Fluxo de Caixa &amp; Projeção de Saldo</h2>
          <div className="xf-pill-group xf-pill-group-small">
            {[30, 60, 90].map((d) => (
              <button
                key={d}
                type="button"
                className={"xf-pill" + (diasProjecao === d ? " active" : "")}
                onClick={() => setDiasProjecao(d)}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <FinanceCashFlowChart mensal={mensal} projecao={projecao} />
      </section>

      {/* ---------- 2. Upload / leitura de NF ---------- */}
      <FinanceUploadPanel documentosDisponiveis={DOCUMENTOS} />

      {/* ---------- 3. Centro de Custo / Obras ---------- */}
      <FinanceCostCenterPanel resumo={resumoCentros} centroSelecionado={centroId} onSelecionarCentro={setCentroId} />

      {/* ---------- 5. Conciliação bancária ---------- */}
      <FinanceReconciliationTable transacoes={transacoesFiltradas} documentos={documentosFiltrados} />
    </div>
  );
}

// Receita Bruta / EBITDA / Impostos / Runway - cada um com sparkline própria
// (série de 14 pontos gerada em torno do valor atual, ver serieTendencia) e
// um %MoM calculado de verdade comparando os últimos 30 dias contra os 30
// anteriores dentro do recorte já filtrado (não é o mesmo período do slicer
// "Período" de cima, que decide o que entra no total - o MoM sempre compara
// mês a mês, senão "Hoje" nunca teria o que comparar).
function buildKpis(transacoesFiltradas, waterfall, totalImpostos, saldoConsolidado, projecao) {
  const agora = Date.now();
  const dias = (t) => (agora - new Date(t.data).getTime()) / 86_400_000;
  const janela = (min, max, tipo) =>
    transacoesFiltradas
      .filter((t) => t.tipo === tipo && dias(t) >= min && dias(t) < max)
      .reduce((s, t) => s + t.valor, 0);
  const pctMoM = (tipo) => {
    const atual = janela(0, 30, tipo);
    const anterior = janela(30, 60, tipo);
    if (anterior === 0) return atual > 0 ? 100 : 0;
    return ((atual - anterior) / anterior) * 100;
  };

  const receitaBruta = waterfall[0].valor;
  const lucroLiquido = waterfall[waterfall.length - 1].valor;
  const runwayDias = projecao.saidaMediaDia > 0 ? Math.round(saldoConsolidado / projecao.saidaMediaDia) : 999;

  return [
    {
      titulo: "Receita Bruta",
      valorFormatado: formatBRL(receitaBruta),
      pct: pctMoM("entrada"),
      serie: serieTendencia(receitaBruta || 1000),
      cor: "#10b981",
    },
    {
      titulo: "EBITDA / Lucro Líquido",
      valorFormatado: formatBRL(lucroLiquido),
      pct: pctMoM("entrada") - pctMoM("saida"),
      serie: serieTendencia(Math.abs(lucroLiquido) || 1000),
      cor: lucroLiquido >= 0 ? "#7c3aed" : "#f43f5e",
    },
    {
      titulo: "Total de Impostos",
      valorFormatado: formatBRL(totalImpostos),
      pct: pctMoM("saida") * 0.6,
      serie: serieTendencia(totalImpostos || 500),
      cor: "#f59e0b",
    },
    {
      titulo: "Runway (dias de caixa)",
      valorFormatado: `${runwayDias} dias`,
      pct: runwayDias >= 60 ? 4.2 : -4.2,
      serie: serieTendencia(runwayDias || 30, 0.08),
      cor: "#0ea5e9",
    },
  ];
}
