import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import { whatsappLink } from "../../utils/contact.js";
import * as api from "../../state/api.js";
import { hojeCivil, adicionarDias } from "./agendaUtils.js";

function primeiroDiaDoMes(dataCivil) {
  return dataCivil.slice(0, 7) + "-01";
}

// Anel de rosca genérico: cada fatia é seu próprio <circle> (não um único
// path complexo) pra poder dar hover fatia a fatia, com uma folga (GAP) na
// borda de cada uma - mesma regra de "gap de superfície entre
// preenchimentos" da skill de dataviz, só que em coordenadas de
// circunferência em vez de pixels de largura de barra.
function Donut({ segmentos, tamanho = 128, espessura = 18, valorCentro, rotuloCentro }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(null);
  const total = segmentos.reduce((s, seg) => s + seg.valor, 0);
  const r = (tamanho - espessura) / 2;
  const c = 2 * Math.PI * r;
  const GAP = 3;
  let acumulado = 0;

  const ativo = hover !== null ? segmentos[hover] : null;

  return (
    <div className="sc-dash-donut-linha">
      <div className="sc-dash-donut-wrap">
        <svg viewBox={`0 0 ${tamanho} ${tamanho}`} width={tamanho} height={tamanho} className="sc-dash-donut">
          <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={espessura} />
          {total > 0 &&
            segmentos.map((seg, i) => {
              if (seg.valor <= 0) return null;
              const frac = seg.valor / total;
              const dash = Math.max(0, frac * c - GAP);
              const rotate = (acumulado / c) * 360 - 90;
              acumulado += frac * c;
              return (
                <circle
                  key={i}
                  cx={tamanho / 2}
                  cy={tamanho / 2}
                  r={r}
                  fill="none"
                  stroke={seg.cor}
                  strokeWidth={espessura}
                  strokeDasharray={`${dash} ${c - dash}`}
                  transform={`rotate(${rotate} ${tamanho / 2} ${tamanho / 2})`}
                  opacity={hover !== null && hover !== i ? 0.4 : 1}
                  className="sc-dash-donut-fatia"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
        </svg>
        <div className="sc-dash-donut-centro">
          <span className="sc-dash-donut-valor">{ativo ? ativo.valor : valorCentro}</span>
          <span className="sc-dash-donut-rotulo">{ativo ? ativo.label : rotuloCentro}</span>
        </div>
      </div>
      <ul className="sc-dash-legenda">
        {segmentos.map((seg, i) => (
          <li
            key={i}
            className={"sc-dash-legenda-item" + (hover === i ? " active" : "")}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <i className="sc-dash-legenda-dot" style={{ background: seg.cor }} />
            <span className="sc-dash-legenda-label">{seg.label}</span>
            <span className="sc-dash-legenda-valor">{seg.valor}</span>
            <span className="sc-dash-legenda-pct">{total > 0 ? Math.round((seg.valor / total) * 100) : 0}%</span>
          </li>
        ))}
        {total === 0 && <li className="sc-empty">{t("saudeClinicas.dashboard.semDados")}</li>}
      </ul>
    </div>
  );
}

// Duas barras horizontais (Particular x Convênio) - mesma dupla categórica
// (azul/laranja) usada nas roscas de duas fatias do resto da tela, pra não
// inventar um terceiro par de cores pro mesmo tipo de pergunta.
function BarrasDuas({ a, b }) {
  const max = Math.max(1, a.valor, b.valor);
  return (
    <div className="sc-dash-barras">
      {[a, b].map((item) => (
        <div key={item.label} className="sc-dash-barra-linha">
          <span className="sc-dash-barra-rotulo">{item.label}</span>
          <div className="sc-dash-barra-trilho">
            <div className="sc-dash-barra-fill" style={{ width: `${(item.valor / max) * 100}%`, background: item.cor }} />
          </div>
          <span className="sc-dash-barra-valor">{item.valor}</span>
        </div>
      ))}
    </div>
  );
}

// Linha/área da evolução no período, com crosshair + tooltip no hover - uma
// faixa invisível cobrindo o gráfico todo escuta o mouse e acha o ponto mais
// próximo pela posição X, sem precisar de um alvo de hover por ponto.
function LinhaEvolucao({ pontos, rotulos }) {
  const { t } = useTranslation();
  const [hoverI, setHoverI] = useState(null);
  const W = 920, H = 220, padL = 34, padR = 12, padT = 16, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(1, ...pontos);
  const n = pontos.length;
  const x = (i) => (n <= 1 ? padL + plotW / 2 : padL + (plotW * i) / (n - 1));
  const y = (v) => padT + plotH - (v / max) * plotH;

  const linha = pontos.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${padL},${padT + plotH} ${linha} ${padL + plotW},${padT + plotH}`;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));

  const temDados = pontos.some((v) => v > 0);

  function moverMouse(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let melhor = 0;
    let menorDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - relX);
      if (d < menorDist) { menorDist = d; melhor = i; }
    }
    setHoverI(melhor);
  }

  if (!temDados) return <div className="sc-empty sc-dash-chart-empty">{t("saudeClinicas.dashboard.semDados")}</div>;

  return (
    <div className="sc-dash-linha-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="sc-dash-linha-svg" role="img" aria-label={t("saudeClinicas.dashboard.evolucao")}>
        <defs>
          <linearGradient id="scDashArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sc-chart-a)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--sc-chart-a)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} className="sc-dash-linha-tick" />
            <text x={padL - 8} y={y(v) + 3} className="sc-dash-axis-label" textAnchor="end">{v}</text>
          </g>
        ))}
        <polygon points={area} fill="url(#scDashArea)" />
        <polyline points={linha} fill="none" stroke="var(--sc-chart-a)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pontos.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={hoverI === i ? 4.5 : 0} fill="var(--sc-chart-a)" stroke="var(--bg-card)" strokeWidth="1.5" />
        ))}
        {n <= 14 &&
          rotulos.map((r, i) => (
            <text key={i} x={x(i)} y={H - 10} className="sc-dash-axis-label" textAnchor="middle">{r}</text>
          ))}
        {hoverI !== null && (
          <line x1={x(hoverI)} x2={x(hoverI)} y1={padT} y2={padT + plotH} className="sc-dash-crosshair" />
        )}
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" onMouseMove={moverMouse} onMouseLeave={() => setHoverI(null)} />
        {hoverI !== null && (() => {
          const label = `${rotulos[hoverI]} · ${pontos[hoverI]}`;
          const w = Math.max(70, label.length * 6.4);
          const tx = Math.min(Math.max(x(hoverI) - w / 2, padL), W - padR - w);
          const ty = y(pontos[hoverI]) - 14;
          return (
            <g pointerEvents="none">
              <rect x={tx} y={Math.max(0, ty - 20)} width={w} height={20} rx={5} className="sc-dash-tip-bg" />
              <text x={tx + w / 2} y={Math.max(0, ty - 20) + 14} className="sc-dash-tip-text" textAnchor="middle">{label}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// Distribuição de gênero: barra empilhada só, sem virar uma segunda rosca -
// é uma métrica de apoio dentro do card de Pacientes, não a pergunta
// principal do card (essa é Novos x Recorrentes, com a rosca).
function BarraGenero({ genero, t }) {
  const total = genero.masculino + genero.feminino + genero.outro;
  if (total === 0) return null;
  const partes = [
    { label: t("saudeClinicas.pacientes.genero.feminino"), valor: genero.feminino, cor: "var(--sc-chart-a)" },
    { label: t("saudeClinicas.pacientes.genero.masculino"), valor: genero.masculino, cor: "var(--sc-chart-b)" },
  ];
  if (genero.outro > 0) partes.push({ label: t("saudeClinicas.pacientes.genero.outro"), valor: genero.outro, cor: "var(--text-muted)" });
  return (
    <div className="sc-dash-genero">
      <div className="sc-dash-genero-trilho">
        {partes.map((p) => (
          <span key={p.label} style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }} title={`${p.label}: ${p.valor}`} />
        ))}
      </div>
      <div className="sc-dash-genero-legenda">
        {partes.map((p) => (
          <span key={p.label} className="sc-dash-legenda-item">
            <i className="sc-dash-legenda-dot" style={{ background: p.cor }} />
            {p.label} <b>{Math.round((p.valor / total) * 100)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

const PRESETS = ["hoje", "7dias", "30dias", "mes"];

export default function DashboardView() {
  const { t, i18n } = useTranslation();
  const [preset, setPreset] = useState("mes");
  const [periodo, setPeriodo] = useState(() => ({ from: primeiroDiaDoMes(hojeCivil()), to: hojeCivil() }));
  const [professionals, setProfessionals] = useState([]);
  const [professionalId, setProfessionalId] = useState("");
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listUsers().then(setProfessionals).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .scGetDashboard(periodo.from, periodo.to, professionalId || undefined)
      .then((d) => { setDados(d); setErro(""); })
      .catch((e) => setErro(translateError(e, t)));
  }, [periodo, professionalId, t]);

  function aplicarPreset(p) {
    setPreset(p);
    const hoje = hojeCivil();
    if (p === "hoje") setPeriodo({ from: hoje, to: hoje });
    else if (p === "7dias") setPeriodo({ from: adicionarDias(hoje, -6), to: hoje });
    else if (p === "30dias") setPeriodo({ from: adicionarDias(hoje, -29), to: hoje });
    else if (p === "mes") setPeriodo({ from: primeiroDiaDoMes(hoje), to: hoje });
  }

  const rotulosEvolucao = useMemo(() => {
    if (!dados) return [];
    return dados.evolucao.map((p) =>
      dados.periodo.agrupamento === "dia"
        ? new Date(p.chave + "T00:00:00").toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit" })
        : new Date(p.chave + "-01T00:00:00").toLocaleDateString(i18n.language, { month: "short" }).replace(".", "")
    );
  }, [dados, i18n.language]);

  if (erro) return <div className="sc-error">{erro}</div>;

  return (
    <div className="sc-dash">
      <div className="sc-dash-header">
        <div className="sc-toggle-group">
          {PRESETS.map((p) => (
            <button key={p} type="button" className={"sc-toggle-btn" + (preset === p ? " active" : "")} onClick={() => aplicarPreset(p)}>
              {t(`saudeClinicas.dashboard.preset.${p}`)}
            </button>
          ))}
        </div>
        <div className="sc-dash-header-datas">
          <input type="date" value={periodo.from} onChange={(e) => { setPreset(null); setPeriodo((p) => ({ ...p, from: e.target.value })); }} />
          <span className="sc-hint">–</span>
          <input type="date" value={periodo.to} onChange={(e) => { setPreset(null); setPeriodo((p) => ({ ...p, to: e.target.value })); }} />
        </div>
        <select className="sc-agenda-filtro" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
          <option value="">{t("saudeClinicas.agenda.filtroProfissionalTodos")}</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {!dados ? (
        <p className="sc-hint">{t("common.loading")}</p>
      ) : (
        <>
          <div className="sc-dash-kpis">
            <div className="sc-dash-kpi sc-dash-kpi-agendado">
              <span className="sc-dash-kpi-valor">{dados.kpis.agendados}</span>
              <span className="sc-dash-kpi-rotulo">{t("saudeClinicas.dashboard.kpi.agendados")}</span>
            </div>
            <div className="sc-dash-kpi sc-dash-kpi-confirmado">
              <span className="sc-dash-kpi-valor">{dados.kpis.confirmados}</span>
              <span className="sc-dash-kpi-rotulo">{t("saudeClinicas.dashboard.kpi.confirmados")}</span>
            </div>
            <div className="sc-dash-kpi sc-dash-kpi-concluido">
              <span className="sc-dash-kpi-valor">{dados.kpis.atendidos}</span>
              <span className="sc-dash-kpi-rotulo">{t("saudeClinicas.dashboard.kpi.atendidos")}</span>
            </div>
            <div className="sc-dash-kpi sc-dash-kpi-faltou">
              <span className="sc-dash-kpi-valor">{dados.kpis.faltas}</span>
              <span className="sc-dash-kpi-rotulo">{t("saudeClinicas.dashboard.kpi.faltas")}</span>
            </div>
          </div>

          <div className="sc-dash-grid">
            <div className="sc-dash-card">
              <h4 className="sc-config-title">{t("saudeClinicas.dashboard.bloco.pacientes")}</h4>
              <Donut
                segmentos={[
                  { label: t("saudeClinicas.dashboard.novos"), valor: dados.pacientes.novos, cor: "var(--sc-chart-a)" },
                  { label: t("saudeClinicas.dashboard.recorrentes"), valor: dados.pacientes.recorrentes, cor: "var(--sc-chart-b)" },
                ]}
                valorCentro={dados.pacientes.total}
                rotuloCentro={t("saudeClinicas.dashboard.pacientes")}
              />
              <BarraGenero genero={dados.pacientes.genero} t={t} />
            </div>

            <div className="sc-dash-card">
              <h4 className="sc-config-title">{t("saudeClinicas.dashboard.bloco.procedimentos")}</h4>
              <Donut
                segmentos={dados.procedimentos.itens.map((p, i) => ({
                  label: p.nome || t("saudeClinicas.dashboard.outros"),
                  valor: p.total,
                  cor: p.nome === null ? "var(--text-muted)" : ["var(--sc-chart-a)", "var(--sc-chart-b)", "var(--sc-chart-c)"][i],
                }))}
                valorCentro={dados.procedimentos.total}
                rotuloCentro={t("saudeClinicas.dashboard.total")}
              />
            </div>

            <div className="sc-dash-card">
              <h4 className="sc-config-title">{t("saudeClinicas.dashboard.bloco.convenio")}</h4>
              <Donut
                segmentos={[
                  { label: t("saudeClinicas.agenda.particular"), valor: dados.convenio.particular, cor: "var(--sc-chart-a)" },
                  { label: t("saudeClinicas.agenda.convenio"), valor: dados.convenio.convenio, cor: "var(--sc-chart-b)" },
                ]}
                valorCentro={dados.convenio.particular + dados.convenio.convenio}
                rotuloCentro={t("saudeClinicas.dashboard.pacientes")}
              />
            </div>

            <div className="sc-dash-card">
              <h4 className="sc-config-title">{t("saudeClinicas.dashboard.bloco.duracao")}</h4>
              <div className="sc-dash-duracao">
                <span className="sc-dash-duracao-valor">{dados.duracaoMediaMin}</span>
                <span className="sc-dash-duracao-unidade">{t("saudeClinicas.dashboard.minutos")}</span>
              </div>
              <p className="sc-hint">{t("saudeClinicas.dashboard.duracaoHint")}</p>
              <BarrasDuas
                a={{ label: t("saudeClinicas.agenda.particular"), valor: dados.convenio.particular, cor: "var(--sc-chart-a)" }}
                b={{ label: t("saudeClinicas.agenda.convenio"), valor: dados.convenio.convenio, cor: "var(--sc-chart-b)" }}
              />
            </div>
          </div>

          <div className="sc-dash-card sc-dash-card-full">
            <h4 className="sc-config-title">{t("saudeClinicas.dashboard.evolucao")}</h4>
            <LinhaEvolucao pontos={dados.evolucao.map((p) => p.total)} rotulos={rotulosEvolucao} />
          </div>

          <div className="sc-dash-card">
            <h4 className="sc-config-title">{t("saudeClinicas.dashboard.aniversariantes")}</h4>
            {dados.aniversariantes.length === 0 ? (
              <p className="sc-empty">{t("saudeClinicas.dashboard.semAniversariantes")}</p>
            ) : (
              <ul className="sc-dash-aniversariantes">
                {dados.aniversariantes.map((p) => (
                  <li key={p.id} className="sc-dash-aniversariante">
                    <span className="sc-dash-aniversariante-nome">🎂 {p.name}</span>
                    {p.phone && (
                      <a className="icon-btn" href={whatsappLink(p.phone, t("saudeClinicas.dashboard.mensagemAniversario", { nome: p.name.split(" ")[0] }))} target="_blank" rel="noopener noreferrer" title={t("saudeClinicas.agenda.enviarLembrete")}>
                        <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20zm4.4-5.5c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.7.9-.3.2-.5.1a6.6 6.6 0 0 1-1.9-1.2 7.1 7.1 0 0 1-1.3-1.6c-.1-.2 0-.3.1-.4l.3-.4.2-.3a.5.5 0 0 0 0-.4c-.1-.1-.5-1.3-.7-1.7s-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.7 2.7 0 0 0-.8 2 4.7 4.7 0 0 0 1 2.5 10.6 10.6 0 0 0 4.1 3.6c.6.2 1 .4 1.4.5a3.3 3.3 0 0 0 1.5.1 2.5 2.5 0 0 0 1.6-1.1 1.9 1.9 0 0 0 .1-1.1c-.1-.1-.2-.2-.4-.3z" /></svg>
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
