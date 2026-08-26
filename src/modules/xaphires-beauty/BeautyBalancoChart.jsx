import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCents } from "../financeiro/dinheiro.js";

// Clone de src/modules/saude-clinicas/BalancoChart.jsx, na paleta rosa do
// módulo (classes beauty-fin-*). Aqui "receitas" é o faturamento recebido e
// "despesas" é a comissão devida aos profissionais no mês - não há conta a
// pagar de verdade no Beauty (ver repo.getMonthlyFinanceSummary).
export default function BeautyBalancoChart({ linhas, meses, lang }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(null);

  const max = useMemo(() => Math.max(1, ...linhas.map((l) => Math.max(l.receitas, l.despesas))), [linhas]);
  const temDados = linhas.some((l) => l.receitas > 0 || l.despesas > 0);

  const W = 760, H = 280, padL = 56, padR = 12, padT = 16, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = Math.max(1, linhas.length);
  const groupW = plotW / n;
  const barW = Math.min(16, groupW * 0.32);
  const gap = 2;
  const y = (v) => padT + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, v: max * f }));

  if (!temDados) return <div className="beauty-cell-muted beauty-fin-chart-empty">{t("modules.xaphiresBeauty.financeiro.vazio")}</div>;

  return (
    <div className="beauty-fin-chart">
      <div className="beauty-fin-legend">
        <span className="beauty-fin-legend-item"><span className="beauty-fin-legend-swatch beauty-fin-entrada-bg" />{t("modules.xaphiresBeauty.financeiro.entradas")}</span>
        <span className="beauty-fin-legend-item"><span className="beauty-fin-legend-swatch beauty-fin-saida-bg" />{t("modules.xaphiresBeauty.financeiro.saidas")}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="beauty-fin-chart-svg" role="img" aria-label={t("modules.xaphiresBeauty.financeiro.balancoMensal")}>
        {ticks.map((tk) => (
          <g key={tk.f}>
            <line x1={padL} x2={W - padR} y1={y(tk.v)} y2={y(tk.v)} className="beauty-fin-grid" />
            <text x={padL - 8} y={y(tk.v) + 3} className="beauty-fin-axis-label" textAnchor="end">
              {formatCents(tk.v, lang).replace(/\s?R\$\s?/, "")}
            </text>
          </g>
        ))}
        {linhas.map((l, gi) => {
          const cx = padL + groupW * gi + groupW / 2;
          const xRec = cx - barW - gap / 2;
          const xDes = cx + gap / 2;
          const barras = [
            { serie: "receitas", x: xRec, v: l.receitas, cls: "beauty-fin-entrada-bg" },
            { serie: "despesas", x: xDes, v: l.despesas, cls: "beauty-fin-saida-bg" },
          ];
          return (
            <g key={l.mes ?? gi}>
              {barras.map((b) => {
                const h = (b.v / max) * plotH;
                const on = hover && hover.gi === gi && hover.serie === b.serie;
                return (
                  <rect
                    key={b.serie} x={b.x} y={y(b.v)} width={barW} height={Math.max(0, h)} rx={3}
                    className={b.cls} opacity={hover && !on ? 0.55 : 1}
                    onMouseEnter={() => setHover({ gi, serie: b.serie })}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
              <text x={cx} y={H - 10} className="beauty-fin-axis-label" textAnchor="middle">{meses ? meses[(l.mes || gi + 1) - 1] : l.mes}</text>
            </g>
          );
        })}
        {hover && (() => {
          const l = linhas[hover.gi];
          const v = hover.serie === "receitas" ? l.receitas : l.despesas;
          const cx = padL + groupW * hover.gi + groupW / 2;
          const ty = y(v) - 10;
          const rotulo = meses ? meses[(l.mes || hover.gi + 1) - 1] : l.mes;
          const label = `${rotulo} · ${formatCents(v, lang)}`;
          const w = Math.max(90, label.length * 6.2);
          const tx = Math.min(Math.max(cx - w / 2, padL), W - padR - w);
          return (
            <g pointerEvents="none">
              <rect x={tx} y={ty - 20} width={w} height={20} rx={5} className="beauty-fin-tip-bg" />
              <text x={tx + w / 2} y={ty - 6} className="beauty-fin-tip-text" textAnchor="middle">{label}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
