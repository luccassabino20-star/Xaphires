import { useMemo, useState } from "react";
import { BANKS, resumoPorCentro, formatBRL } from "./financeMockData.js";
import FinanceCostCenterPanel from "./FinanceCostCenterPanel.jsx";

// Pilar "Obras & Contas" do menu lateral: gerenciador dos centros de
// custo/obras (reaproveita FinanceCostCenterPanel.jsx, mas com seleção só
// local - LOCAL de propósito, diferente da Central Executiva, que tem os
// próprios slicers; cruzar as duas telas exigiria subir o filtro pro layout
// sem necessidade real pedida) e a lista de contas bancárias ativas.
export default function FinanceObrasContas({ transacoes, formulas }) {
  const [centroSelecionado, setCentroSelecionado] = useState(null);
  const resumo = useMemo(() => resumoPorCentro(transacoes), [transacoes]);

  return (
    <div className="xf-view">
      <FinanceCostCenterPanel
        resumo={resumo}
        centroSelecionado={centroSelecionado}
        onSelecionarCentro={setCentroSelecionado}
        metaPct={formulas.margemMetaPct}
      />

      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Contas Bancárias Ativas</h2>
        </div>
        <table className="xf-table xf-contas-table">
          <thead>
            <tr>
              <th>Banco</th>
              <th>Saldo Atual</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {BANKS.map((b) => (
              <tr key={b.id}>
                <td>
                  <span className="xf-bank-dot" style={{ background: b.cor }} /> {b.nome}
                </td>
                <td className="xf-num">{formatBRL(b.saldo)}</td>
                <td>
                  <span className="xf-status-badge xf-status-match">Ativa</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
