// Mini-gráfico de tendência dentro do card de KPI. Mesmo desenho manual em
// SVG do resto do projeto (ver DonutChart/BalancoChart em
// src/modules/saude-clinicas) - sem lib de gráfico, só um <polyline>.
export default function FinanceSparkline({ pontos, width = 88, height = 28, cor = "#7c3aed" }) {
  if (!pontos || pontos.length < 2) return null;
  const max = Math.max(...pontos);
  const min = Math.min(...pontos);
  const range = max - min || 1;
  const step = width / (pontos.length - 1);
  const coords = pontos.map((v, i) => [i * step, height - ((v - min) / range) * height]);
  const linha = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${linha} ${width},${height}`;
  const subiu = pontos[pontos.length - 1] >= pontos[0];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="xf-spark">
      <polygon points={area} fill={cor} opacity="0.12" />
      <polyline points={linha} fill="none" stroke={subiu ? cor : "#f43f5e"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="2.2" fill={subiu ? cor : "#f43f5e"} />
    </svg>
  );
}
