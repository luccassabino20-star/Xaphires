import { useMemo, useState } from "react";
import {
  BANKS,
  COST_CENTERS,
  DOCUMENTOS,
  formatBRL,
  filtrarTransacoes,
  fluxoMensal,
  projecaoSaldo,
  composicaoTributaria,
  dreWaterfall,
  serieTendencia,
  montarVariaveisFormula,
} from "./financeMockData.js";
import { avaliarFormula, formatarValorMetrica } from "./formulaEngine.js";
import FinanceSparkline from "./FinanceSparkline.jsx";
import FinanceWaterfallChart from "./FinanceWaterfallChart.jsx";
import FinanceDonutChart from "./FinanceDonutChart.jsx";
import FinanceCashFlowChart from "./FinanceCashFlowChart.jsx";

// Pilar "Central Executiva" do menu lateral - dashboard estilo BI: saldos
// bancários, slicers, KPIs com sparkline, DRE em cascata, composição
// tributária e fluxo de caixa com projeção. `transacoes` e `formulas` vêm de
// FinanceModuleLayout (estado compartilhado com Base de Dados e Fórmulas &
// Métricas - ver comentário lá) - qualquer lançamento novo ou fórmula
// alterada nas outras telas recalcula tudo aqui pelas mesmas dependências de
// useMemo, sem precisar de nenhum "refresh" manual.
export default function FinanceCentralExecutiva({ transacoes, formulas }) {
  const [periodo, setPeriodo] = useState("trimestre");
  const [bancoId, setBancoId] = useState(null);
  const [centroId, setCentroId] = useState(null);
  const [diasProjecao, setDiasProjecao] = useState(90);

  const transacoesFiltradas = useMemo(
    () => filtrarTransacoes(transacoes, { bancoId, centroId, periodo }),
    [transacoes, bancoId, centroId, periodo]
  );

  const documentosFiltrados = useMemo(
    () => (centroId ? DOCUMENTOS.filter((d) => d.centroId === centroId) : DOCUMENTOS),
    [centroId]
  );
  const tributos = useMemo(() => composicaoTributaria(documentosFiltrados), [documentosFiltrados]);
  const totalImpostos = useMemo(() => tributos.reduce((s, t) => s + t.total, 0), [tributos]);
  const waterfall = useMemo(
    () => dreWaterfall(transacoesFiltradas, totalImpostos, formulas),
    [transacoesFiltradas, totalImpostos, formulas]
  );
  const mensal = useMemo(() => fluxoMensal(transacoesFiltradas), [transacoesFiltradas]);

  const saldoConsolidado = useMemo(() => {
    const bancos = bancoId ? BANKS.filter((b) => b.id === bancoId) : BANKS;
    return bancos.reduce((s, b) => s + b.saldo, 0);
  }, [bancoId]);

  const projecao = useMemo(
    () => projecaoSaldo(transacoesFiltradas, saldoConsolidado, diasProjecao, formulas.runwayJanelaDias),
    [transacoesFiltradas, saldoConsolidado, diasProjecao, formulas.runwayJanelaDias]
  );

  const kpis = useMemo(
    () => buildKpis(transacoesFiltradas, waterfall, totalImpostos, saldoConsolidado, projecao, formulas),
    [transacoesFiltradas, waterfall, totalImpostos, saldoConsolidado, projecao, formulas]
  );

  // Variáveis que uma métrica customizada (Fórmulas & Métricas) enxerga como
  // [Nome] - calculadas em cima do MESMO recorte já filtrado por banco/
  // centro/período que os 4 KPIs padrão usam, pra uma métrica nova respeitar
  // os mesmos slicers em vez de sempre olhar o quadro inteiro.
  const variaveisFormula = useMemo(
    () => montarVariaveisFormula(waterfall, totalImpostos, saldoConsolidado),
    [waterfall, totalImpostos, saldoConsolidado]
  );
  const kpisFinal = useMemo(
    () => aplicarMetricasCustomizadas(kpis, formulas.metricas || [], variaveisFormula),
    [kpis, formulas.metricas, variaveisFormula]
  );

  const bancoAtivo = BANKS.find((b) => b.id === bancoId);
  const centroAtivo = COST_CENTERS.find((c) => c.id === centroId);

  return (
    <div className="xf-view">
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

      <section className="xf-kpis">
        {kpisFinal.map((k) => (
          <div key={k.slot} className="xf-kpi-card">
            <div className="xf-kpi-card-top">
              <span className="xf-kpi-titulo">{k.titulo}</span>
              {!k.semVariacao && (
                <span className={"xf-kpi-mom" + (k.pct >= 0 ? " xf-positivo" : " xf-negativo")}>
                  {k.pct >= 0 ? "▲" : "▼"} {Math.abs(k.pct).toFixed(1)}% MoM
                </span>
              )}
              {k.semVariacao && <span className="xf-kpi-custom-badge">Customizado</span>}
            </div>
            <span className="xf-kpi-valor">{k.valorFormatado}</span>
            <FinanceSparkline pontos={k.serie} cor={k.cor} />
          </div>
        ))}
      </section>

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
    </div>
  );
}

// Receita Bruta / EBITDA-ou-Lucro-Líquido / Impostos / Runway - cada um com
// sparkline própria e %MoM calculado comparando os últimos 30 dias contra os
// 30 anteriores dentro do recorte já filtrado. formulas.ebitdaExcluirImpostos
// decide se o segundo card soma os impostos de volta (aproximação de
// EBITDA) ou mostra o Lucro Líquido puro - ver DEFAULT_FORMULAS.
function buildKpis(transacoesFiltradas, waterfall, totalImpostos, saldoConsolidado, projecao, formulas) {
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
  const segundoCardValor = formulas.ebitdaExcluirImpostos ? lucroLiquido + totalImpostos : lucroLiquido;
  const runwayDias =
    projecao.saidaMediaDia > 0 ? Math.round(saldoConsolidado / projecao.saidaMediaDia) : 999;

  return [
    {
      slot: "receita",
      titulo: "Receita Bruta",
      valorFormatado: formatBRL(receitaBruta),
      pct: pctMoM("entrada"),
      serie: serieTendencia(receitaBruta || 1000),
      cor: "#10b981",
    },
    {
      slot: "segundo",
      titulo: formulas.ebitdaExcluirImpostos ? "EBITDA (aprox.)" : "Lucro Líquido",
      valorFormatado: formatBRL(segundoCardValor),
      pct: pctMoM("entrada") - pctMoM("saida"),
      serie: serieTendencia(Math.abs(segundoCardValor) || 1000),
      cor: segundoCardValor >= 0 ? "#7c3aed" : "#f43f5e",
    },
    {
      slot: "impostos",
      titulo: "Total de Impostos",
      valorFormatado: formatBRL(totalImpostos),
      pct: pctMoM("saida") * 0.6,
      serie: serieTendencia(totalImpostos || 500),
      cor: "#f59e0b",
    },
    {
      slot: "runway",
      titulo: "Runway (dias de caixa)",
      valorFormatado: `${runwayDias} dias`,
      pct: runwayDias >= 60 ? 4.2 : -4.2,
      serie: serieTendencia(runwayDias || 30, 0.08),
      cor: "#0ea5e9",
    },
  ];
}

// Aplica as métricas customizadas (Fórmulas & Métricas) por cima dos 4 KPIs
// padrão: quem tem exibirCard=true e substituirSlot num dos 4 slots fixos
// TROCA o card padrão daquele slot; quem tem substituirSlot="novo" (ou não
// tem slot nenhum reconhecido) entra como card adicional, ao final. Métrica
// com erro de fórmula ainda aparece (com "Erro na fórmula" no lugar do
// valor) - some da fórmula, não do dashboard, senão a pessoa não teria como
// saber que precisa corrigir.
function aplicarMetricasCustomizadas(kpisBase, metricas, variaveisFormula) {
  const porSlot = new Map(kpisBase.map((k) => [k.slot, k]));
  const extras = [];
  metricas
    .filter((m) => m.exibirCard)
    .forEach((m) => {
      const resultado = avaliarFormula(m.expressao, variaveisFormula);
      const card = {
        slot: `custom-${m.id}`,
        titulo: m.nome,
        valorFormatado: resultado.ok ? formatarValorMetrica(resultado.valor, m.formato) : "Erro na fórmula",
        pct: 0,
        semVariacao: true,
        serie: serieTendencia(Math.abs(resultado.valor) || 1000),
        cor: resultado.ok && resultado.valor < 0 ? "#f43f5e" : "#7c3aed",
      };
      if (m.substituirSlot && m.substituirSlot !== "novo" && porSlot.has(m.substituirSlot)) {
        porSlot.set(m.substituirSlot, card);
      } else {
        extras.push(card);
      }
    });
  return [...porSlot.values(), ...extras];
}
