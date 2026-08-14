import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents } from "./dinheiro.js";

// Rótulos curtos dos meses no idioma de quem olha, via Intl - sem tabela própria
// de nomes de mês para manter em três lugares.
function nomesMeses(lang) {
  const fmt = new Intl.DateTimeFormat(lang, { month: "short" });
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2020, i, 1)).replace(".", ""));
}

// Gráfico de barras agrupadas: por mês, entradas (azul) x saídas (laranja)
// REALIZADAS. Par de cores validado para daltonismo (dataviz). Eixo único,
// marcas finas com topo arredondado, 2px de folga entre as barras, tooltip no
// hover. As cores vêm de variáveis de tema (--fin-entrada/--fin-saida) para
// trocarem no claro/escuro.
function GraficoFluxo({ linhas, meses, lang }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(null); // { gi, serie }

  const max = useMemo(
    () => Math.max(1, ...linhas.map((l) => Math.max(l.entradasRealizadas, l.saidasRealizadas))),
    [linhas]
  );

  const W = 760, H = 300, padL = 56, padR = 12, padT = 16, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const groupW = plotW / 12;
  const barW = Math.min(14, groupW * 0.3);
  const gap = 2; // folga de superfície entre as duas barras do grupo
  const y = (v) => padT + plotH - (v / max) * plotH;

  // 4 linhas de grade recessivas, com rótulo de valor.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, v: max * f }));

  const temDados = linhas.some((l) => l.entradasRealizadas > 0 || l.saidasRealizadas > 0);
  if (!temDados) return <div className="fin-empty fin-chart-empty">{t("financeiro.vazio")}</div>;

  return (
    <div className="fin-chart">
      <div className="fin-legend">
        <span className="fin-legend-item"><span className="fin-legend-swatch" style={{ background: "var(--fin-entrada)" }} />{t("financeiro.fluxo.entradas")}</span>
        <span className="fin-legend-item"><span className="fin-legend-swatch" style={{ background: "var(--fin-saida)" }} />{t("financeiro.fluxo.saidas")}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-chart-svg" role="img" aria-label={t("financeiro.tabs.fluxo")}>
        {ticks.map((tk) => (
          <g key={tk.f}>
            <line x1={padL} x2={W - padR} y1={y(tk.v)} y2={y(tk.v)} className="fin-grid" />
            <text x={padL - 8} y={y(tk.v) + 3} className="fin-axis-label" textAnchor="end">
              {formatCents(tk.v, lang).replace(/\s?R\$\s?/, "")}
            </text>
          </g>
        ))}
        {linhas.map((l, gi) => {
          const cx = padL + groupW * gi + groupW / 2;
          const xEnt = cx - barW - gap / 2;
          const xSai = cx + gap / 2;
          const barras = [
            { serie: "entradas", x: xEnt, v: l.entradasRealizadas, cor: "var(--fin-entrada)" },
            { serie: "saidas", x: xSai, v: l.saidasRealizadas, cor: "var(--fin-saida)" },
          ];
          return (
            <g key={gi}>
              {barras.map((b) => {
                const h = (b.v / max) * plotH;
                const on = hover && hover.gi === gi && hover.serie === b.serie;
                return (
                  <rect
                    key={b.serie}
                    x={b.x}
                    y={y(b.v)}
                    width={barW}
                    height={Math.max(0, h)}
                    rx={3}
                    fill={b.cor}
                    opacity={hover && !on ? 0.55 : 1}
                    onMouseEnter={() => setHover({ gi, serie: b.serie })}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
              <text x={cx} y={H - 10} className="fin-axis-label" textAnchor="middle">{meses[gi]}</text>
            </g>
          );
        })}
        {hover && (() => {
          const l = linhas[hover.gi];
          const v = hover.serie === "entradas" ? l.entradasRealizadas : l.saidasRealizadas;
          const cx = padL + groupW * hover.gi + groupW / 2;
          const ty = y(v) - 10;
          const label = `${meses[hover.gi]} · ${formatCents(v, lang)}`;
          const w = Math.max(90, label.length * 6.2);
          const tx = Math.min(Math.max(cx - w / 2, padL), W - padR - w);
          return (
            <g pointerEvents="none">
              <rect x={tx} y={ty - 20} width={w} height={20} rx={5} className="fin-tip-bg" />
              <text x={tx + w / 2} y={ty - 6} className="fin-tip-text" textAnchor="middle">{label}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

export default function FluxoView() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const meses = useMemo(() => nomesMeses(lang), [lang]);

  const [ano, setAno] = useState(new Date().getFullYear());
  const [fluxo, setFluxo] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api
      .finGetFluxo(ano)
      .then((f) => { setFluxo(f); setErro(""); })
      .catch((err) => setErro(translateError(err, t)));
  }, [ano, t]);

  if (erro) return <div className="fin-error">{erro}</div>;
  if (!fluxo) return <div className="fin-loading">{t("common.loading")}</div>;

  const { totais, linhas } = fluxo;

  return (
    <div className="fin-fluxo">
      <div className="fin-fluxo-head">
        <div className="fin-year">
          <button className="btn-ghost btn-small" onClick={() => setAno((a) => a - 1)}>‹</button>
          <span className="fin-year-value">{ano}</span>
          <button className="btn-ghost btn-small" onClick={() => setAno((a) => a + 1)}>›</button>
        </div>
      </div>

      <div className="fin-kpis">
        <div className="fin-kpi fin-kpi-receber">
          <span className="fin-kpi-label">{t("financeiro.fluxo.entradasRealizadas")}</span>
          <span className="fin-kpi-value">{formatCents(totais.entradasRealizadas, lang)}</span>
        </div>
        <div className="fin-kpi fin-kpi-pagar">
          <span className="fin-kpi-label">{t("financeiro.fluxo.saidasRealizadas")}</span>
          <span className="fin-kpi-value">{formatCents(totais.saidasRealizadas, lang)}</span>
        </div>
        <div className="fin-kpi">
          <span className="fin-kpi-label">{t("financeiro.fluxo.saldoRealizado")}</span>
          <span className="fin-kpi-value">{formatCents(totais.saldoRealizado, lang)}</span>
        </div>
      </div>

      <GraficoFluxo linhas={linhas} meses={meses} lang={lang} />

      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>{t("financeiro.fluxo.mes")}</th>
              <th className="fin-num">{t("financeiro.fluxo.entradas")}</th>
              <th className="fin-num">{t("financeiro.fluxo.saidas")}</th>
              <th className="fin-num">{t("financeiro.fluxo.saldo")}</th>
              <th className="fin-num">{t("financeiro.fluxo.acumulado")}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes}>
                <td>{meses[l.mes - 1]}</td>
                <td className="fin-num fin-receber">{formatCents(l.entradasRealizadas, lang)}</td>
                <td className="fin-num fin-pagar">{formatCents(l.saidasRealizadas, lang)}</td>
                <td className="fin-num">{formatCents(l.saldoRealizado, lang)}</td>
                <td className="fin-num">{formatCents(l.saldoAcumulado, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
