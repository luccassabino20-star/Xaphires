import { useTranslation } from "react-i18next";
import { formatCents } from "../financeiro/dinheiro.js";

// Paleta fixa, na ordem em que os segmentos aparecem - repete se houver mais
// fatias que cores (raro: convênio/procedimento não costuma passar de 6-8
// grupos numa clínica). Cores distintas o bastante entre si (não é uma
// gradação single-hue) para não depender só da posição pra diferenciar.
const CORES = ["#2a78d6", "#eb6834", "#22a06b", "#a855f7", "#eab308", "#ec4899", "#14b8a6", "#64748b"];

// Donut simples via <circle> com stroke-dasharray/offset (sem lib de
// gráfico, mesmo padrão manual do resto do projeto) - um círculo por fatia,
// cada um cobrindo sua porção da circunferência e deslocado pra continuar de
// onde o anterior parou.
export default function DonutChart({ titulo, dados, lang }) {
  const { t } = useTranslation();
  const total = dados.reduce((s, d) => s + d.total, 0);
  const R = 60, C = 2 * Math.PI * R, CX = 80, CY = 80;

  let acumulado = 0;
  const fatias = dados.map((d, i) => {
    const fracao = total > 0 ? d.total / total : 0;
    const dasharray = `${fracao * C} ${C - fracao * C}`;
    const dashoffset = -acumulado * C;
    acumulado += fracao;
    return { ...d, cor: CORES[i % CORES.length], dasharray, dashoffset, pct: Math.round(fracao * 100) };
  });

  return (
    <div className="sc-fin-donut-card">
      <h4 className="sc-fin-donut-titulo">{titulo}</h4>
      {total === 0 ? (
        <div className="sc-empty sc-fin-donut-vazio">{t("saudeClinicas.financeiro.semLancamentos")}</div>
      ) : (
        <div className="sc-fin-donut-body">
          <svg viewBox="0 0 160 160" width="140" height="140" className="sc-fin-donut-svg">
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--bg-list)" strokeWidth="22" />
            {fatias.map((f) => (
              <circle
                key={f.nome} cx={CX} cy={CY} r={R} fill="none" stroke={f.cor} strokeWidth="22"
                strokeDasharray={f.dasharray} strokeDashoffset={f.dashoffset}
                transform={`rotate(-90 ${CX} ${CY})`} strokeLinecap="butt"
              />
            ))}
            <text x={CX} y={CY - 4} textAnchor="middle" className="sc-fin-donut-total">{formatCents(total, lang)}</text>
          </svg>
          <ul className="sc-fin-donut-legenda">
            {fatias.map((f) => (
              <li key={f.nome}>
                <span className="sc-fin-donut-swatch" style={{ background: f.cor }} />
                <span className="sc-fin-donut-nome">{f.nome}</span>
                <span className="sc-fin-donut-pct">{f.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
