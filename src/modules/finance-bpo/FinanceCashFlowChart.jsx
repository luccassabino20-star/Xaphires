import { useState } from "react";
import { formatBRL, formatBRLShort } from "./financeMockData.js";

// Combo barras (entradas/saídas mensais, eixo esquerdo) + linha tracejada
// (saldo projetado, eixo direito - escala própria, porque o saldo acumulado
// é uma ordem de grandeza maior que o fluxo mensal). A costura entre
// "histórico" e "projeção" é só uma linha vertical de referência ("hoje"),
// sem tentar achatar as duas escalas numa só - deixaria as barras ilegíveis.
export default function FinanceCashFlowChart({ mensal, projecao }) {
  const [hover, setHover] = useState(null);

  const W = 760,
    H = 300,
    padL = 64,
    padR = 64,
    padT = 20,
    padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxBarra = Math.max(1, ...mensal.map((m) => Math.max(m.entradas, m.saidas)));
  const nBarras = Math.max(1, mensal.length);
  const barGroupW = (plotW * 0.4) / nBarras;
  const yBarra = (v) => padT + plotH - (v / maxBarra) * plotH;

  const pontos = projecao.pontos;
  const maxSaldo = Math.max(...pontos.map((p) => p.saldo));
  const minSaldo = Math.min(...pontos.map((p) => p.saldo), 0);
  const xProjecao = (i) => padL + plotW * 0.42 + (plotW * 0.58 * i) / (pontos.length - 1);
  const yProjecao = (v) => padT + plotH - ((v - minSaldo) / (maxSaldo - minSaldo || 1)) * plotH;
  const linha = pontos.map((p, i) => `${xProjecao(i).toFixed(1)},${yProjecao(p.saldo).toFixed(1)}`).join(" ");

  return (
    <div className="xf-cashflow">
      <div className="xf-legend-row">
        <span className="xf-legend-item">
          <span className="xf-legend-swatch" style={{ background: "#10b981" }} /> Entradas
        </span>
        <span className="xf-legend-item">
          <span className="xf-legend-swatch" style={{ background: "#f43f5e" }} /> Saídas
        </span>
        <span className="xf-legend-item">
          <span className="xf-legend-swatch xf-legend-dash" /> Saldo projetado
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="xf-chart-svg" role="img" aria-label="Fluxo de caixa e projeção de saldo">
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={padL} x2={W - padR} y1={padT + plotH * f} y2={padT + plotH * f} className="xf-chart-grid" />
        ))}
        <line
          x1={padL + plotW * 0.42}
          x2={padL + plotW * 0.42}
          y1={padT}
          y2={padT + plotH}
          className="xf-cashflow-today-line"
        />
        <text x={padL + plotW * 0.42} y={padT - 6} textAnchor="middle" className="xf-chart-axis">
          hoje
        </text>

        {mensal.map((m, i) => {
          const cx = padL + barGroupW * i + barGroupW / 2;
          return (
            <g key={m.mes}>
              <rect
                x={cx - barGroupW * 0.32}
                y={yBarra(m.entradas)}
                width={barGroupW * 0.28}
                height={Math.max(0, (m.entradas / maxBarra) * plotH)}
                rx={2}
                fill="#10b981"
                opacity={hover && hover !== m.mes ? 0.5 : 1}
                onMouseEnter={() => setHover(m.mes)}
                onMouseLeave={() => setHover(null)}
              />
              <rect
                x={cx + barGroupW * 0.04}
                y={yBarra(m.saidas)}
                width={barGroupW * 0.28}
                height={Math.max(0, (m.saidas / maxBarra) * plotH)}
                rx={2}
                fill="#f43f5e"
                opacity={hover && hover !== m.mes ? 0.5 : 1}
                onMouseEnter={() => setHover(m.mes)}
                onMouseLeave={() => setHover(null)}
              />
              <text x={cx} y={H - 10} textAnchor="middle" className="xf-chart-axis">
                {m.mes.slice(5)}/{m.mes.slice(2, 4)}
              </text>
            </g>
          );
        })}

        <polyline points={linha} fill="none" stroke="var(--xf-accent)" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
        {pontos
          .filter((_, i) => i % 3 === 0)
          .map((p) => (
            <circle key={p.dia} cx={xProjecao(pontos.indexOf(p))} cy={yProjecao(p.saldo)} r="2.4" fill="var(--xf-accent)" />
          ))}

        <text x={padL - 8} y={padT + 8} textAnchor="end" className="xf-chart-axis">
          {formatBRLShort(maxBarra)}
        </text>
        <text x={W - padR + 8} y={padT + 8} textAnchor="start" className="xf-chart-axis">
          {formatBRLShort(maxSaldo)}
        </text>
      </svg>
      {hover && (
        <div className="xf-cashflow-tip">
          {(() => {
            const m = mensal.find((x) => x.mes === hover);
            return (
              <>
                <strong>{m.mes}</strong> · Entradas {formatBRL(m.entradas)} · Saídas {formatBRL(m.saidas)}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
