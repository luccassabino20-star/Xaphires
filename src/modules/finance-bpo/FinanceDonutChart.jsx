import { formatBRLShort } from "./financeMockData.js";

// Composição tributária - mesmo desenho de src/modules/saude-clinicas/DonutChart.jsx
// (círculos concêntricos via stroke-dasharray), reimplementado aqui em vez de
// importado: o protótipo é isolado de propósito (ver comentário no topo de
// XaphiresFinanceView.jsx).
const CORES = ["#7c3aed", "#0ea5e9", "#f59e0b", "#f43f5e", "#10b981", "#64748b"];

export default function FinanceDonutChart({ dados }) {
  const total = dados.reduce((s, d) => s + d.total, 0);
  const R = 58,
    C = 2 * Math.PI * R,
    CX = 80,
    CY = 80;
  let acumulado = 0;
  const fatias = dados.map((d, i) => {
    const fracao = total > 0 ? d.total / total : 0;
    const dasharray = `${fracao * C} ${C - fracao * C}`;
    const dashoffset = -acumulado * C;
    acumulado += fracao;
    return { ...d, cor: CORES[i % CORES.length], dasharray, dashoffset, pct: Math.round(fracao * 100) };
  });

  return (
    <div className="xf-donut">
      <svg viewBox="0 0 160 160" width="150" height="150">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--xf-border)" strokeWidth="20" />
        {fatias.map((f) => (
          <circle
            key={f.nome}
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={f.cor}
            strokeWidth="20"
            strokeDasharray={f.dasharray}
            strokeDashoffset={f.dashoffset}
            transform={`rotate(-90 ${CX} ${CY})`}
          />
        ))}
        <text x={CX} y={CY - 4} textAnchor="middle" className="xf-donut-total">
          {formatBRLShort(total)}
        </text>
        <text x={CX} y={CY + 14} textAnchor="middle" className="xf-donut-total-label">
          total
        </text>
      </svg>
      <ul className="xf-donut-legend">
        {fatias.map((f) => (
          <li key={f.nome}>
            <span className="xf-donut-swatch" style={{ background: f.cor }} />
            <span className="xf-donut-nome">{f.nome}</span>
            <span className="xf-donut-pct">{f.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
