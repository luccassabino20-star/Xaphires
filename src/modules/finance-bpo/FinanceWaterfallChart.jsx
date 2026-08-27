import { formatBRLShort } from "./financeMockData.js";

// Cascata do DRE executivo - cada barra "total"/"subtotal" nasce do zero;
// cada barra "queda" flutua entre o total corrente e o total corrente + o
// delta (negativo), com uma linha pontilhada ligando ao topo da barra
// anterior, pro efeito de "cascata" ficar visível mesmo parado (sem
// depender de animação).
export default function FinanceWaterfallChart({ passos }) {
  let corrente = 0;
  const barras = passos.map((p) => {
    const ehTotal = p.tipo === "total" || p.tipo === "subtotal";
    const base = ehTotal ? 0 : corrente;
    const topo = ehTotal ? p.valor : corrente + p.valor;
    corrente = topo;
    return { ...p, base, topo, min: Math.min(base, topo), max: Math.max(base, topo) };
  });

  const maiorValor = Math.max(...barras.map((b) => b.max), 0);
  const menorValor = Math.min(...barras.map((b) => b.min), 0);
  const W = 720,
    H = 260,
    padL = 64,
    padR = 16,
    padT = 20,
    padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = barras.length;
  const colW = plotW / n;
  const barW = Math.min(72, colW * 0.55);
  const escala = (v) => padT + plotH - ((v - menorValor) / (maiorValor - menorValor || 1)) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => menorValor + (maiorValor - menorValor) * f);

  function corDe(tipo) {
    if (tipo === "total") return "var(--xf-accent)";
    if (tipo === "subtotal") return "#0ea5e9";
    return "#f43f5e";
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="xf-waterfall-svg" role="img" aria-label="DRE em cascata">
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={escala(v)} y2={escala(v)} className="xf-chart-grid" />
          <text x={padL - 8} y={escala(v) + 3} className="xf-chart-axis" textAnchor="end">
            {formatBRLShort(v)}
          </text>
        </g>
      ))}
      {barras.map((b, i) => {
        const cx = padL + colW * i + colW / 2;
        const anterior = i > 0 ? barras[i - 1] : null;
        return (
          <g key={b.label}>
            {anterior && (
              <line
                x1={padL + colW * (i - 1) + colW / 2 + barW / 2}
                x2={cx - barW / 2}
                y1={escala(anterior.topo)}
                y2={escala(anterior.topo)}
                className="xf-waterfall-connector"
              />
            )}
            <rect
              x={cx - barW / 2}
              y={escala(b.max)}
              width={barW}
              height={Math.max(2, escala(b.min) - escala(b.max))}
              rx={4}
              fill={corDe(b.tipo)}
            />
            <text x={cx} y={escala(b.max) - 8} textAnchor="middle" className="xf-waterfall-value">
              {b.valor >= 0 ? "+" : ""}
              {formatBRLShort(b.valor)}
            </text>
            <text x={cx} y={H - 14} textAnchor="middle" className="xf-chart-axis">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
