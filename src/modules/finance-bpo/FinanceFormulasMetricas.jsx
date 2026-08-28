import { useMemo, useState } from "react";
import {
  BANKS,
  CATEGORIAS_SAIDA,
  DEFAULT_FORMULAS,
  composicaoTributaria,
  dreWaterfall,
  projecaoSaldo,
  montarVariaveisFormula,
  formatBRL,
} from "./financeMockData.js";
import { avaliarFormula, formatarValorMetrica } from "./formulaEngine.js";
import FinanceMetricBuilderModal from "./FinanceMetricBuilderModal.jsx";
import FinanceCategorizationRules from "./FinanceCategorizationRules.jsx";

// Pilar "Fórmulas & Métricas" do menu lateral: os campos aqui escrevem
// direto em `formulas` (estado em FinanceModuleLayout, compartilhado com
// Central Executiva) - sem botão "Aplicar" de propósito, porque o pedido foi
// "refletidos automaticamente". O preview abaixo do formulário roda a MESMA
// dreWaterfall/projecaoSaldo que a Central Executiva usa, só que sem
// filtro de banco/centro/período (visão geral) - é o que prova, ali mesmo
// nesta tela, que a fórmula nova já pegou, sem precisar trocar de aba.
//
// Duas seções novas (construtor DAX/Power Query): "Métricas Customizadas"
// (formulas.metricas, avaliadas por formulaEngine.js) e "Regras de
// Categorização" (formulas.regrasCategorizacao, componente próprio porque a
// lógica de condição é bem diferente da de fórmula numérica - ver
// FinanceCategorizationRules.jsx).
export default function FinanceFormulasMetricas({ transacoes, formulas, onAtualizar }) {
  // undefined = modal fechado; null = criando métrica nova; objeto = editando uma existente.
  const [metricaEditando, setMetricaEditando] = useState(undefined);

  function set(campo, valor) {
    onAtualizar({ ...formulas, [campo]: valor });
  }
  function toggleCategoriaExcluida(categoria) {
    const atual = formulas.custosOperacionaisExcluir;
    const novo = atual.includes(categoria) ? atual.filter((c) => c !== categoria) : [...atual, categoria];
    set("custosOperacionaisExcluir", novo);
  }
  function restaurarPadrao() {
    onAtualizar(DEFAULT_FORMULAS);
  }

  const metricas = formulas.metricas || [];
  function salvarMetrica(metrica) {
    const existe = metricas.some((m) => m.id === metrica.id);
    set("metricas", existe ? metricas.map((m) => (m.id === metrica.id ? metrica : m)) : [...metricas, metrica]);
    setMetricaEditando(undefined);
  }
  function duplicarMetrica(m) {
    set("metricas", [...metricas, { ...m, id: `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`, nome: `${m.nome} (cópia)` }]);
  }
  function excluirMetrica(id) {
    set("metricas", metricas.filter((m) => m.id !== id));
  }
  function toggleExibirCard(id) {
    set("metricas", metricas.map((m) => (m.id === id ? { ...m, exibirCard: !m.exibirCard } : m)));
  }
  function mudarSlot(id, slot) {
    set("metricas", metricas.map((m) => (m.id === id ? { ...m, substituirSlot: slot } : m)));
  }

  const tributos = useMemo(() => composicaoTributaria(), []);
  const totalImpostos = useMemo(() => tributos.reduce((s, t) => s + t.total, 0), [tributos]);
  const waterfall = useMemo(() => dreWaterfall(transacoes, totalImpostos, formulas), [transacoes, totalImpostos, formulas]);
  const saldoConsolidado = useMemo(() => BANKS.reduce((s, b) => s + b.saldo, 0), []);
  const projecao = useMemo(
    () => projecaoSaldo(transacoes, saldoConsolidado, 30, formulas.runwayJanelaDias),
    [transacoes, saldoConsolidado, formulas.runwayJanelaDias]
  );
  const lucroLiquido = waterfall[waterfall.length - 1].valor;
  const ebitdaAprox = lucroLiquido + totalImpostos;
  const runwayDias = projecao.saidaMediaDia > 0 ? Math.round(saldoConsolidado / projecao.saidaMediaDia) : 999;
  const variaveisFormula = useMemo(
    () => montarVariaveisFormula(waterfall, totalImpostos, saldoConsolidado),
    [waterfall, totalImpostos, saldoConsolidado]
  );

  return (
    <div className="xf-view">
      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Fórmulas de Cálculo</h2>
          <button type="button" className="xf-link-btn" onClick={restaurarPadrao}>
            Restaurar padrão
          </button>
        </div>
        <p className="xf-panel-hint">
          Mudanças aqui recalculam a Central Executiva na hora - o preview abaixo mostra o efeito sem trocar de aba.
        </p>

        <div className="xf-formula-block">
          <label className="xf-formula-label" htmlFor="xf-runway-input">
            Janela de cálculo do Runway (dias)
          </label>
          <p className="xf-formula-desc">
            Runway = saldo em caixa ÷ queima média diária. A queima média olha pra trás esse número de dias - menos dias
            reage mais rápido a uma mudança recente de ritmo, mais dias suaviza picos isolados.
          </p>
          <input
            id="xf-runway-input"
            type="range"
            min="7"
            max="90"
            step="1"
            value={formulas.runwayJanelaDias}
            onChange={(e) => set("runwayJanelaDias", Number(e.target.value))}
          />
          <span className="xf-formula-value">{formulas.runwayJanelaDias} dias</span>
        </div>

        <div className="xf-formula-block">
          <label className="xf-formula-label">
            <input
              type="checkbox"
              checked={formulas.ebitdaExcluirImpostos}
              onChange={(e) => set("ebitdaExcluirImpostos", e.target.checked)}
            />
            Card "EBITDA" soma os impostos de volta ao Lucro Líquido
          </label>
          <p className="xf-formula-desc">
            EBITDA por definição é antes de impostos (e depreciação/amortização, que este protótipo não rastreia como
            categoria própria). Desligado, o card mostra o Lucro Líquido de verdade, já descontado.
          </p>
        </div>

        <div className="xf-formula-block">
          <span className="xf-formula-label">Categorias fora de "Custos Operacionais" no DRE em cascata</span>
          <p className="xf-formula-desc">
            "Impostos" já sai antes, no Lucro Bruto, e não aparece nesta lista. Marcar uma categoria aqui tira ela do
            passo "Custos Operacionais" da cascata - útil pra ver o DRE só com custo variável, por exemplo.
          </p>
          <div className="xf-formula-checks">
            {CATEGORIAS_SAIDA.filter((c) => c !== "Impostos").map((c) => (
              <label key={c} className="xf-formula-check-item">
                <input
                  type="checkbox"
                  checked={formulas.custosOperacionaisExcluir.includes(c)}
                  onChange={() => toggleCategoriaExcluida(c)}
                />
                {c}
              </label>
            ))}
          </div>
        </div>

        <div className="xf-formula-block">
          <label className="xf-formula-label" htmlFor="xf-margem-input">
            Meta de margem por obra (%)
          </label>
          <p className="xf-formula-desc">Referência usada em Obras &amp; Contas para marcar cada obra acima ou abaixo da meta.</p>
          <input
            id="xf-margem-input"
            type="number"
            min="0"
            max="100"
            step="1"
            value={formulas.margemMetaPct}
            onChange={(e) => set("margemMetaPct", Number(e.target.value) || 0)}
          />
          <span className="xf-formula-value">%</span>
        </div>
      </div>

      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Preview com as fórmulas atuais</h2>
        </div>
        <p className="xf-panel-hint">Sem filtro de banco/centro/período - visão geral, mesma base que a Central Executiva usa.</p>
        <div className="xf-preview-grid">
          <div className="xf-preview-item">
            <span className="xf-parsed-label">Lucro Líquido</span>
            <span className="xf-parsed-value">{formatBRL(lucroLiquido)}</span>
          </div>
          <div className="xf-preview-item">
            <span className="xf-parsed-label">EBITDA (aprox.)</span>
            <span className="xf-parsed-value">{formatBRL(ebitdaAprox)}</span>
          </div>
          <div className="xf-preview-item">
            <span className="xf-parsed-label">Runway</span>
            <span className="xf-parsed-value">{runwayDias} dias</span>
          </div>
        </div>
      </div>

      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Métricas Customizadas</h2>
          <button type="button" className="xf-btn-primary xf-btn-small" onClick={() => setMetricaEditando(null)}>
            + Criar Nova Métrica Customizada
          </button>
        </div>
        <p className="xf-panel-hint">
          Fórmulas próprias em cima dos campos do módulo, estilo DAX/Power Query. Marque "Exibir como card KPI" para levar o
          resultado direto para a Central Executiva - com a opção de substituir um dos 4 cards padrão em vez de só somar mais um.
        </p>

        {metricas.length === 0 ? (
          <div className="xf-empty-row">Nenhuma métrica customizada ainda.</div>
        ) : (
          <ul className="xf-metrics-list">
            {metricas.map((m) => {
              const resultado = avaliarFormula(m.expressao, variaveisFormula);
              return (
                <li key={m.id} className="xf-metric-item">
                  <div className="xf-metric-item-main">
                    <span className="xf-metric-nome">{m.nome}</span>
                    <code className="xf-metric-formula">{m.expressao}</code>
                  </div>
                  <span className={"xf-metric-item-value" + (resultado.ok ? "" : " xf-negativo")}>
                    {resultado.ok ? formatarValorMetrica(resultado.valor, m.formato) : "Erro na fórmula"}
                  </span>
                  <div className="xf-metric-item-controls">
                    <label className="xf-formula-check-item">
                      <input type="checkbox" checked={!!m.exibirCard} onChange={() => toggleExibirCard(m.id)} />
                      Exibir como card KPI
                    </label>
                    {m.exibirCard && (
                      <select value={m.substituirSlot || "novo"} onChange={(e) => mudarSlot(m.id, e.target.value)}>
                        <option value="novo">Card adicional</option>
                        <option value="receita">Substituir "Receita Bruta"</option>
                        <option value="segundo">Substituir "Lucro Líquido/EBITDA"</option>
                        <option value="impostos">Substituir "Total de Impostos"</option>
                        <option value="runway">Substituir "Runway"</option>
                      </select>
                    )}
                  </div>
                  <div className="xf-metric-item-actions">
                    <button type="button" className="xf-link-btn" onClick={() => setMetricaEditando(m)}>
                      Editar
                    </button>
                    <button type="button" className="xf-link-btn" onClick={() => duplicarMetrica(m)}>
                      Duplicar
                    </button>
                    <button type="button" className="xf-link-btn xf-link-btn-danger" onClick={() => excluirMetrica(m.id)}>
                      Excluir
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <FinanceCategorizationRules
        transacoes={transacoes}
        regras={formulas.regrasCategorizacao || []}
        onAtualizar={(novas) => set("regrasCategorizacao", novas)}
      />

      {metricaEditando !== undefined && (
        <FinanceMetricBuilderModal
          metrica={metricaEditando}
          valoresVariaveis={variaveisFormula}
          onSalvar={salvarMetrica}
          onFechar={() => setMetricaEditando(undefined)}
        />
      )}
    </div>
  );
}
