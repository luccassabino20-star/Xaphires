import { useTranslation } from "react-i18next";
import { formatCents } from "../financeiro/dinheiro.js";

// Clone de src/modules/saude-clinicas/DonutChart.jsx, na paleta rosa do
// módulo (classes beauty-fin-*, cores fixas por segmento em vez de
// depender de --beauty-accent - mesmo motivo do --sc-fin-receita fixo lá:
// o gráfico precisa distinguir fatias entre si, não combinar com a marca).
const CORES = ["#B76E79", "#9C5661", "#D9A441", "#5B8A72", "#6D8FB0", "#A85751"];

export default function BeautyDonutChart({ titulo, dados, lang }) {
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
    <div className="beauty-fin-donut-card">
      <h4 className="beauty-fin-donut-titulo">{titulo}</h4>
      {total === 0 ? (
        <div className="beauty-cell-muted beauty-fin-donut-vazio">{t("modules.xaphiresBeauty.financeiro.vazio")}</div>
      ) : (
        <div className="beauty-fin-donut-body">
          <svg viewBox="0 0 160 160" width="140" height="140" className="beauty-fin-donut-svg">
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--beauty-bg)" strokeWidth="22" />
            {fatias.map((f) => (
              <circle
                key={f.nome} cx={CX} cy={CY} r={R} fill="none" stroke={f.cor} strokeWidth="22"
                strokeDasharray={f.dasharray} strokeDashoffset={f.dashoffset}
                transform={`rotate(-90 ${CX} ${CY})`} strokeLinecap="butt"
              />
            ))}
            <text x={CX} y={CY - 4} textAnchor="middle" className="beauty-fin-donut-total">{formatCents(total, lang)}</text>
          </svg>
          <ul className="beauty-fin-donut-legenda">
            {fatias.map((f) => (
              <li key={f.nome}>
                <span className="beauty-fin-donut-swatch" style={{ background: f.cor }} />
                <span className="beauty-fin-donut-nome">{f.nome}</span>
                <span className="beauty-fin-donut-pct">{f.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
