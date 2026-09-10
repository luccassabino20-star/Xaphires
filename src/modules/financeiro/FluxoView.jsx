import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
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

function IconDownload({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
function IconChart({ size = 28 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10M10 20V4M16 20v-7M4 20h16" />
    </svg>
  );
}

// Gráfico de barras agrupadas: por mês, entradas (verde) x saídas (vermelho).
// `modo` escolhe qual par de campos ler de cada linha - "realizado" (baixado,
// por paid_at) ou "previsto" (aberto, por vencimento) - mesmo componente, só
// os campos lidos mudam, sem duplicar o SVG inteiro por modo. Par de cores
// validado para daltonismo (dataviz), das variáveis de tema
// (--fin-entrada/--fin-saida) para trocarem no claro/escuro.
function GraficoFluxo({ linhas, meses, lang, modo }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(null); // { gi, serie }
  const kEntradas = modo === "previsto" ? "entradasPrevistas" : "entradasRealizadas";
  const kSaidas = modo === "previsto" ? "saidasPrevistas" : "saidasRealizadas";

  const max = useMemo(
    () => Math.max(1, ...linhas.map((l) => Math.max(l[kEntradas], l[kSaidas]))),
    [linhas, kEntradas, kSaidas]
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

  const temDados = linhas.some((l) => l[kEntradas] > 0 || l[kSaidas] > 0);
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
            { serie: "entradas", x: xEnt, v: l[kEntradas], cor: "var(--fin-entrada)" },
            { serie: "saidas", x: xSai, v: l[kSaidas], cor: "var(--fin-saida)" },
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
          const v = hover.serie === "entradas" ? l[kEntradas] : l[kSaidas];
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
  const showToast = useToast();
  const meses = useMemo(() => nomesMeses(lang), [lang]);

  const [ano, setAno] = useState(new Date().getFullYear());
  const [fluxo, setFluxo] = useState(null);
  const [erro, setErro] = useState("");
  const [modoGrafico, setModoGrafico] = useState("realizado");
  const [exportAberto, setExportAberto] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    api
      .finGetFluxo(ano)
      .then((f) => { setFluxo(f); setErro(""); })
      .catch((err) => setErro(translateError(err, t)));
  }, [ano, t]);

  useEffect(() => {
    if (!exportAberto) return;
    function onDoc(e) { if (exportRef.current && !exportRef.current.contains(e.target)) setExportAberto(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [exportAberto]);

  async function exportar(formato) {
    setExportAberto(false);
    try {
      await api.finExportFluxo(ano, formato, lang);
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  if (erro) return <div className="fin-error">{erro}</div>;
  if (!fluxo) return <div className="fin-loading">{t("common.loading")}</div>;

  const { totais, linhas } = fluxo;
  const saldoPrevisto = totais.entradasPrevistas - totais.saidasPrevistas;
  const semDadosNoAno = linhas.every((l) => !l.entradasRealizadas && !l.saidasRealizadas && !l.entradasPrevistas && !l.saidasPrevistas);

  return (
    <div className="fin-fluxo">
      <div className="contatos-header">
        <div>
          <h2 className="contatos-titulo">{t("financeiro.fluxo.headerTitulo")}</h2>
          <p className="contatos-contador">{t("financeiro.fluxo.headerSubtitulo")}</p>
        </div>
        <div className="contatos-header-acoes">
          <div className="contatos-export" ref={exportRef}>
            <button type="button" className="btn-secondary btn-small" onClick={() => setExportAberto((v) => !v)}>
              <IconDownload /> {t("financeiro.fluxo.exportarRelatorio")}
            </button>
            {exportAberto && (
              <div className="dropdown">
                <div className="dropdown-item" onClick={() => exportar("csv")}>{t("financeiro.fluxo.exportarCsv")}</div>
                <div className="dropdown-item" onClick={() => exportar("pdf")}>{t("financeiro.fluxo.exportarPdf")}</div>
              </div>
            )}
          </div>
          <div className="fin-year">
            <button className="btn-ghost btn-small" onClick={() => setAno((a) => a - 1)}>‹</button>
            <span className="fin-year-value">{ano}</span>
            <button className="btn-ghost btn-small" onClick={() => setAno((a) => a + 1)}>›</button>
          </div>
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
        <div className="fin-kpi">
          <div className="contas-kpi-topo">
            <span className="fin-kpi-label">{t("financeiro.fluxo.saldoPrevisto")}</span>
            <span className="contas-kpi-badge">{t("financeiro.fluxo.previstoSelo")}</span>
          </div>
          <span className={"fin-kpi-value " + (saldoPrevisto >= 0 ? "fin-receber" : "fin-pagar")}>{formatCents(saldoPrevisto, lang)}</span>
        </div>
      </div>

      {semDadosNoAno ? (
        <div className="contas-empty">
          <span className="contas-empty-icone"><IconChart /></span>
          <h3 className="contas-empty-titulo">{t("financeiro.fluxo.emptyTitulo")}</h3>
          <p className="contas-empty-texto">{t("financeiro.fluxo.emptyTexto")}</p>
        </div>
      ) : (
        <>
          <div className="timing-toggle">
            <button type="button" className={"timing-toggle-btn" + (modoGrafico === "realizado" ? " active" : "")} onClick={() => setModoGrafico("realizado")}>
              {t("financeiro.fluxo.toggleRealizado")}
            </button>
            <button type="button" className={"timing-toggle-btn" + (modoGrafico === "previsto" ? " active" : "")} onClick={() => setModoGrafico("previsto")}>
              {t("financeiro.fluxo.togglePrevisto")}
            </button>
          </div>

          <GraficoFluxo linhas={linhas} meses={meses} lang={lang} modo={modoGrafico} />

          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>{t("financeiro.fluxo.mes")}</th>
                  <th className="fin-num">{t("financeiro.fluxo.entradas")}</th>
                  <th className="fin-num">{t("financeiro.fluxo.saidas")}</th>
                  <th className="fin-num">{t("financeiro.fluxo.saldo")}</th>
                  <th className="fin-num">{t("financeiro.fluxo.acumulado")}</th>
                  <th className="fin-num">{t("financeiro.fluxo.entradasPrevistas")}</th>
                  <th className="fin-num">{t("financeiro.fluxo.saidasPrevistas")}</th>
                  <th className="fin-num">{t("financeiro.fluxo.saldoPrevisto")}</th>
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
                    <td className="fin-num fin-receber">{formatCents(l.entradasPrevistas, lang)}</td>
                    <td className="fin-num fin-pagar">{formatCents(l.saidasPrevistas, lang)}</td>
                    <td className="fin-num">{formatCents(l.saldoPrevisto, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
