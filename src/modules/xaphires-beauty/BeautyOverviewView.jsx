import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { useAuth } from "../../state/AuthContext.jsx";
import BeautyIcon from "./BeautyIcon.jsx";

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Helpers de data civil (mesma reescrita local de BeautyAgendaView.jsx - o
// módulo não compartilha esses utilitários entre as próprias telas, decisão
// já tomada lá: cada tela fica sozinha e legível sem ir procurar num arquivo
// comum).
function parseDataCivil(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function paraCivil(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function adicionarDias(s, n) {
  const d = parseDataCivil(s);
  d.setDate(d.getDate() + n);
  return paraCivil(d);
}
function segundaDaSemana(s) {
  const d = parseDataCivil(s);
  const diaSemana = d.getDay();
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + offset);
  return paraCivil(d);
}
function diasEntre(from, to) {
  const dias = [];
  let atual = from;
  while (atual <= to) {
    dias.push(atual);
    atual = adicionarDias(atual, 1);
  }
  return dias;
}
function formatarValor(cents, locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}
function formatarDiaPorExtenso(s, lang) {
  const d = parseDataCivil(s);
  const rotulo = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long" }).format(d);
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}
function formatarDiaMes(s, lang) {
  const d = parseDataCivil(s);
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(d).replace(".", "");
}
function horasLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

// Início/fim do período (Hoje/Semana/Mês) e do período anterior equivalente
// (usado só para a pílula de comparação da receita) - tudo em data civil
// (YYYY-MM-DD), mesma convenção do resto do módulo.
function intervaloDoPeriodo(periodo, hoje) {
  if (periodo === "hoje") {
    return { from: hoje, to: hoje, fromAnterior: adicionarDias(hoje, -1), toAnterior: adicionarDias(hoje, -1) };
  }
  if (periodo === "semana") {
    const seg = segundaDaSemana(hoje);
    const segAnterior = adicionarDias(seg, -7);
    return { from: seg, to: adicionarDias(seg, 6), fromAnterior: segAnterior, toAnterior: adicionarDias(segAnterior, 6) };
  }
  const d = parseDataCivil(hoje);
  const primeiro = paraCivil(new Date(d.getFullYear(), d.getMonth(), 1));
  const ultimo = paraCivil(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const primeiroAnterior = paraCivil(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const ultimoAnterior = paraCivil(new Date(d.getFullYear(), d.getMonth(), 0));
  return { from: primeiro, to: ultimo, fromAnterior: primeiroAnterior, toAnterior: ultimoAnterior };
}

const HORAS_GRAFICO = Array.from({ length: 13 }, (_, i) => 8 + i); // 8h-20h, mesma janela da grade da Agenda
const HORA_INICIO = 8 * 60;
const HORA_FIM = 20 * 60;

// Gráfico de barras da receita (um por dia no período Semana/Mês, um por
// hora no período Hoje) - clone de BeautyBalancoChart.jsx em série única
// (aqui não há "saída", só o faturamento recebido), mesma técnica de SVG à
// mão + tooltip no hover, sem biblioteca de gráfico.
function BeautyReceitaChart({ pontos, lang, oculto, vazioLabel }) {
  const [hover, setHover] = useState(null);
  const temDados = pontos.some((p) => p.value > 0);
  const max = Math.max(1, ...pontos.map((p) => p.value));
  const W = 640, H = 190, padL = 46, padR = 8, padT = 10, padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = Math.max(1, pontos.length);
  const groupW = plotW / n;
  const barW = Math.max(3, Math.min(18, groupW * 0.55));
  const y = (v) => padT + plotH - (v / max) * plotH;
  const ticks = [0, 0.5, 1].map((f) => ({ f, v: max * f }));
  const fmt = (v) => (oculto ? "••••" : formatarValor(v, lang));

  if (!temDados) return <div className="beauty-cell-muted beauty-fin-chart-empty">{vazioLabel}</div>;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="beauty-fin-chart-svg" role="img">
      {ticks.map((tk) => (
        <g key={tk.f}>
          <line x1={padL} x2={W - padR} y1={y(tk.v)} y2={y(tk.v)} className="beauty-fin-grid" />
          <text x={padL - 8} y={y(tk.v) + 3} className="beauty-fin-axis-label" textAnchor="end">
            {oculto ? "••" : formatarValor(tk.v, lang).replace(/\s?R\$\s?/, "")}
          </text>
        </g>
      ))}
      {pontos.map((p, i) => {
        const cx = padL + groupW * i + groupW / 2;
        const h = (p.value / max) * plotH;
        const on = hover === i;
        return (
          <g key={p.key}>
            <rect
              x={cx - barW / 2} y={y(p.value)} width={barW} height={Math.max(0, h)} rx={2.5}
              className={p.destaque ? "beauty-ov-bar-hoje-bg" : "beauty-ov-bar-bg"}
              opacity={hover != null && !on ? 0.55 : 1}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
            {p.label && (
              <text x={cx} y={H - 6} className="beauty-fin-axis-label" textAnchor="middle">{p.label}</text>
            )}
          </g>
        );
      })}
      {hover != null && (() => {
        const p = pontos[hover];
        const cx = padL + groupW * hover + groupW / 2;
        const ty = y(p.value) - 10;
        const label = `${p.label || p.key} · ${fmt(p.value)}`;
        const w = Math.max(70, label.length * 6);
        const tx = Math.min(Math.max(cx - w / 2, padL), W - padR - w);
        return (
          <g pointerEvents="none">
            <rect x={tx} y={ty - 20} width={w} height={20} rx={5} className="beauty-fin-tip-bg" />
            <text x={tx + w / 2} y={ty - 6} className="beauty-fin-tip-text" textAnchor="middle">{label}</text>
          </g>
        );
      })()}
    </svg>
  );
}

// Dashboard operacional (redesenho pedido pelo cliente, referência de
// imagem): saudação + ações no topo, receita do período com gráfico de
// barras e agenda de hoje à esquerda, KPIs rápidos e desempenho da equipe à
// direita. Onda de dados: agendamentos vêm de /appointments (sem trava de
// plano); equipe/pagamentos vêm de /staff e /payments, que exigem o plano
// com financeiro - falha 403 aí não é erro de tela, é "esta empresa não tem
// esse recurso", tratado com .catch(() => []) como o resto do módulo já faz,
// e os widgets que dependem só desses dados mostram o mesmo cartão de
// bloqueio usado em Financeiro/Equipe (BeautyFinanceView/BeautyStaffView).
export default function BeautyOverviewView({ onNavigate }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const hoje = hojeCivil();
  const [periodo, setPeriodo] = useState("mes");
  const [oculto, setOculto] = useState(false);
  const [agendamentos, setAgendamentos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [horariosPorStaff, setHorariosPorStaff] = useState({});
  const [pagamentos, setPagamentos] = useState([]);
  const [pagamentosAnteriores, setPagamentosAnteriores] = useState([]);
  const [semFinanceiro, setSemFinanceiro] = useState(false);
  const [erro, setErro] = useState("");

  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje), [periodo, hoje]);

  useEffect(() => {
    const { from, to, fromAnterior, toAnterior } = intervalo;
    let semFin = false;
    Promise.all([
      api.xbGetAppointments(`${from}T00:00:00`, `${to}T23:59:59`),
      api.xbGetClients(),
      api.xbGetStaff().catch(() => []),
      api.xbGetPayments(`${from}T00:00:00`, `${to}T23:59:59`).catch((e) => {
        if (e.status === 403) semFin = true;
        return [];
      }),
      api.xbGetPayments(`${fromAnterior}T00:00:00`, `${toAnterior}T23:59:59`).catch(() => []),
    ])
      .then(([ags, cls, eq, pags, pagsAnt]) => {
        setAgendamentos(ags);
        setClientes(cls);
        setEquipe(eq);
        setPagamentos(pags);
        setPagamentosAnteriores(pagsAnt);
        setSemFinanceiro(semFin);
        setErro("");
      })
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, [periodo]);

  useEffect(() => {
    if (equipe.length === 0) {
      setHorariosPorStaff({});
      return;
    }
    let ativo = true;
    Promise.all(equipe.map(async (s) => [s.id, await api.xbGetStaffHours(s.id).catch(() => [])])).then((pares) => {
      if (ativo) setHorariosPorStaff(Object.fromEntries(pares));
    });
    return () => {
      ativo = false;
    };
  }, [equipe]);

  const primeiroNome = (user?.name || "").split(" ")[0];
  const saudacaoKey = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "bomDia";
    if (h < 18) return "boaTarde";
    return "boaNoite";
  }, []);

  const itensHoje = useMemo(
    () => agendamentos.filter((a) => a.starts_at.slice(0, 10) === hoje && a.status !== "cancelado"),
    [agendamentos, hoje]
  );

  const kpiAgendamentos = useMemo(() => {
    const naoCancelados = agendamentos.filter((a) => a.status !== "cancelado");
    return { total: naoCancelados.length, finalizados: naoCancelados.filter((a) => a.status === "concluido").length };
  }, [agendamentos]);

  const kpiCancelamentos = useMemo(() => {
    const total = agendamentos.length;
    const cancelados = agendamentos.filter((a) => a.status === "cancelado").length;
    return { total: cancelados, pct: total > 0 ? Math.round((cancelados / total) * 100) : 0 };
  }, [agendamentos]);

  const kpiClientes = useMemo(() => {
    const seteDiasAtras = adicionarDias(hoje, -7);
    return {
      total: clientes.filter((c) => c.created_at && c.created_at.slice(0, 10) >= intervalo.from && c.created_at.slice(0, 10) <= intervalo.to).length,
      ultimos7: clientes.filter((c) => c.created_at && c.created_at.slice(0, 10) >= seteDiasAtras).length,
    };
  }, [clientes, intervalo, hoje]);

  // "A receber" é aproximado: agendamento não cancelado sem NENHUM pagamento
  // no ledger do mesmo período conta como pendente. Um atendimento pago fora
  // dessa janela (ex.: feito no fim do mês, pago só no mês seguinte) escaparia
  // dessa conta - aceitável no volume de um salão, mesmo espírito de
  // aproximação do backfill de created_at (ver reports/dados.js).
  const aReceber = useMemo(() => {
    const idsComPagamento = new Set(pagamentos.map((p) => p.appointment_id));
    const pendentes = agendamentos.filter((a) => a.status !== "cancelado" && !idsComPagamento.has(a.id));
    return { total: pendentes.reduce((s, a) => s + (a.price_cents || 0), 0), count: pendentes.length };
  }, [agendamentos, pagamentos]);

  const totalAtual = useMemo(() => pagamentos.reduce((s, p) => s + p.amount_cents, 0), [pagamentos]);
  const totalAnterior = useMemo(() => pagamentosAnteriores.reduce((s, p) => s + p.amount_cents, 0), [pagamentosAnteriores]);
  const comparacao = useMemo(() => {
    if (totalAnterior === 0) return { tipo: "flat", pct: 0 };
    const pct = Math.round(((totalAtual - totalAnterior) / totalAnterior) * 100);
    return { tipo: pct >= 0 ? "up" : "down", pct };
  }, [totalAtual, totalAnterior]);

  const pontosReceita = useMemo(() => {
    if (periodo === "hoje") {
      const porHora = new Map(HORAS_GRAFICO.map((h) => [h, 0]));
      for (const p of pagamentos) {
        // paid_at é um instante real (ISO com "Z", ver server/repo.js nowIso()),
        // diferente de starts_at/ends_at (data/hora civil ingênua) - por isso
        // aqui o bucket certo é a hora LOCAL do instante (new Date().getHours()),
        // não uma fatia de string do UTC, que erra o balde perto da virada de
        // fuso (um pagamento às 21h em Brasília vira 00h em UTC).
        const h = new Date(p.paid_at).getHours();
        if (porHora.has(h)) porHora.set(h, porHora.get(h) + p.amount_cents);
      }
      const horaAtual = new Date().getHours();
      return HORAS_GRAFICO.map((h) => ({ key: String(h), label: `${h}h`, value: porHora.get(h), destaque: h === horaAtual }));
    }
    const dias = diasEntre(intervalo.from, intervalo.to);
    const porDia = new Map(dias.map((d) => [d, 0]));
    for (const p of pagamentos) {
      const d = paraCivil(new Date(p.paid_at)); // mesma razão do bucket por hora acima: dia LOCAL do instante
      if (porDia.has(d)) porDia.set(d, porDia.get(d) + p.amount_cents);
    }
    const n = dias.length;
    const passo = Math.max(1, Math.ceil(n / 5));
    return dias.map((d, i) => {
      const mostraLabel = n <= 10 || i === 0 || i === n - 1 || i % passo === 0;
      return { key: d, label: mostraLabel ? String(parseDataCivil(d).getDate()) : "", value: porDia.get(d), destaque: d === hoje };
    });
  }, [pagamentos, periodo, intervalo, hoje]);

  const ocupacaoEquipe = useMemo(() => {
    const weekday = parseDataCivil(hoje).getDay();
    return equipe
      .map((s) => {
        const horarios = horariosPorStaff[s.id] || [];
        let disponivel = HORA_FIM - HORA_INICIO;
        if (horarios.length > 0) {
          const doDia = horarios.find((h) => h.weekday === weekday);
          disponivel = doDia
            ? Number(doDia.end_time.slice(0, 2)) * 60 + Number(doDia.end_time.slice(3, 5)) - (Number(doDia.start_time.slice(0, 2)) * 60 + Number(doDia.start_time.slice(3, 5)))
            : 0;
        }
        const ocupado = itensHoje.filter((a) => a.staff_id === s.id).reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
        const pct = disponivel > 0 ? Math.min(100, Math.round((ocupado / disponivel) * 100)) : ocupado > 0 ? 100 : 0;
        return { id: s.id, nome: s.name, cor: s.color, ocupadoMin: ocupado, disponivelMin: disponivel, pct };
      })
      .filter((s) => s.disponivelMin > 0 || s.ocupadoMin > 0);
  }, [equipe, horariosPorStaff, itensHoje, hoje]);

  const desempenhoEquipe = useMemo(() => {
    const naoCancelados = agendamentos.filter((a) => a.status !== "cancelado" && a.staff_id);
    const porStaff = new Map(equipe.map((s) => [s.id, { id: s.id, nome: s.name, cor: s.color, count: 0, valorCents: 0 }]));
    for (const a of naoCancelados) {
      const linha = porStaff.get(a.staff_id);
      if (!linha) continue;
      linha.count += 1;
      linha.valorCents += a.price_cents || 0;
    }
    const linhas = [...porStaff.values()].filter((l) => l.count > 0).sort((a, b) => b.valorCents - a.valorCents);
    const totalValor = linhas.reduce((s, l) => s + l.valorCents, 0);
    return linhas.map((l) => ({ ...l, pct: totalValor > 0 ? Math.round((l.valorCents / totalValor) * 100) : 0 }));
  }, [agendamentos, equipe]);

  const mostrar = (valorFormatado) => (oculto ? "••••••" : valorFormatado);
  const rangeLabel = periodo === "hoje" ? formatarDiaMes(hoje, i18n.language) : `${formatarDiaMes(intervalo.from, i18n.language)} - ${formatarDiaMes(intervalo.to, i18n.language)}`;

  return (
    <div>
      {erro && <div className="beauty-error">{erro}</div>}

      <div className="beauty-ov-header">
        <div>
          <h2 className="beauty-ov-greeting">{t(`modules.xaphiresBeauty.visaoGeral.saudacao.${saudacaoKey}`, { nome: primeiroNome || t("modules.xaphiresBeauty.perfil.proprietario") })}</h2>
          <p className="beauty-ov-sub">
            {t("modules.xaphiresBeauty.visaoGeral.resumoDia", { count: itensHoje.length, data: formatarDiaPorExtenso(hoje, i18n.language) })}
          </p>
        </div>
        <div className="beauty-ov-actions">
          <div className="beauty-view-toggle">
            {["hoje", "semana", "mes"].map((p) => (
              <button key={p} type="button" className={periodo === p ? "active" : ""} onClick={() => setPeriodo(p)}>
                {t(`modules.xaphiresBeauty.visaoGeral.periodo.${p}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="beauty-ov-eye-btn"
            title={t(`modules.xaphiresBeauty.visaoGeral.${oculto ? "mostrarValores" : "ocultarValores"}`)}
            onClick={() => setOculto((v) => !v)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
              {oculto && <path d="M4 4l16 16" />}
            </svg>
          </button>
          <button type="button" className="btn-primary" onClick={() => onNavigate?.("agenda")}>
            + {t("modules.xaphiresBeauty.agenda.novo")}
          </button>
        </div>
      </div>

      <div className="beauty-ov-grid">
        <div className="beauty-ov-col">
          <div className="beauty-card beauty-ov-card">
            <div className="beauty-ov-card-head">
              <h3 className="beauty-ov-card-title">{t(`modules.xaphiresBeauty.visaoGeral.receitaTitulo.${periodo}`)}</h3>
              <span className="beauty-cell-muted">{rangeLabel}</span>
            </div>
            {semFinanceiro ? (
              <div className="beauty-lock-card">
                <BeautyIcon name="financeiro" size={30} />
                <span>{t("modules.xaphiresBeauty.financeiro.bloqueado", { plano: t("plan.names.intermediate") })}</span>
              </div>
            ) : (
              <>
                <div className="beauty-ov-revenue-row">
                  <span className="beauty-ov-revenue-value">{mostrar(formatarValor(totalAtual, i18n.language))}</span>
                </div>
                <p className="beauty-ov-revenue-compare">
                  <span className={`beauty-ov-pill beauty-ov-pill-${comparacao.tipo}`}>
                    {comparacao.tipo === "flat" ? t("modules.xaphiresBeauty.visaoGeral.semBase") : `${comparacao.pct > 0 ? "+" : ""}${comparacao.pct}%`}
                  </span>
                  {t("modules.xaphiresBeauty.visaoGeral.contraAnterior", { valor: mostrar(formatarValor(totalAnterior, i18n.language)) })}
                </p>
                <BeautyReceitaChart pontos={pontosReceita} lang={i18n.language} oculto={oculto} vazioLabel={t("modules.xaphiresBeauty.visaoGeral.vazioReceita")} />
              </>
            )}
          </div>

          <div className="beauty-card beauty-ov-card">
            <div className="beauty-ov-card-head">
              <h3 className="beauty-ov-card-title">{t("modules.xaphiresBeauty.visaoGeral.agendaHoje")}</h3>
              <button type="button" className="beauty-ov-card-link" onClick={() => onNavigate?.("agenda")}>
                {t("modules.xaphiresBeauty.visaoGeral.verTodos")}
              </button>
            </div>
            {ocupacaoEquipe.length === 0 ? (
              <p className="beauty-cell-muted" style={{ margin: "10px 0 0" }}>
                {itensHoje.length === 0 ? t("modules.xaphiresBeauty.visaoGeral.semAgendamentosHoje") : t("modules.xaphiresBeauty.visaoGeral.semEquipeCadastrada")}
              </p>
            ) : (
              <div className="beauty-ov-occ-list">
                {ocupacaoEquipe.map((s) => (
                  <div key={s.id} className="beauty-ov-occ-row">
                    <span className="beauty-ov-occ-nome">{s.nome}</span>
                    <span className="beauty-ov-occ-track">
                      <span className="beauty-ov-occ-fill" style={{ width: `${s.pct}%`, background: s.cor || "var(--beauty-accent)" }} />
                    </span>
                    <span className="beauty-ov-occ-label">{horasLabel(s.ocupadoMin)} / {horasLabel(s.disponivelMin)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="beauty-ov-col">
          <div className="beauty-card beauty-ov-card">
            <div className="beauty-ov-kpi-grid beauty-metrics" style={{ marginBottom: 0 }}>
              <div className="beauty-metric-card">
                <span className="beauty-metric-value">{kpiAgendamentos.total}</span>
                <span className="beauty-metric-label">{t("modules.xaphiresBeauty.visaoGeral.kpiAgendamentos")}</span>
                <span className="beauty-metric-sub">{t("modules.xaphiresBeauty.visaoGeral.kpiSubFinalizados", { count: kpiAgendamentos.finalizados })}</span>
              </div>
              <div className="beauty-metric-card">
                <span className="beauty-metric-value">{kpiClientes.total}</span>
                <span className="beauty-metric-label">{t("modules.xaphiresBeauty.visaoGeral.kpiNovosClientes")}</span>
                <span className="beauty-metric-sub">{t("modules.xaphiresBeauty.visaoGeral.kpiSubUltimos7Dias", { count: kpiClientes.ultimos7 })}</span>
              </div>
              <div className="beauty-metric-card">
                <span className="beauty-metric-value">{kpiCancelamentos.total}</span>
                <span className="beauty-metric-label">{t("modules.xaphiresBeauty.visaoGeral.kpiCancelamentos")}</span>
                <span className="beauty-metric-sub">{t("modules.xaphiresBeauty.visaoGeral.kpiSubPercentualTotal", { pct: kpiCancelamentos.pct })}</span>
              </div>
              <div className="beauty-metric-card">
                <span className="beauty-metric-value">{semFinanceiro ? "—" : mostrar(formatarValor(aReceber.total, i18n.language))}</span>
                <span className="beauty-metric-label">{t("modules.xaphiresBeauty.visaoGeral.kpiAReceber")}</span>
                <span className="beauty-metric-sub">
                  {semFinanceiro ? t("modules.xaphiresBeauty.visaoGeral.kpiIndisponivel") : t("modules.xaphiresBeauty.visaoGeral.kpiSubCobrancasAbertas", { count: aReceber.count })}
                </span>
              </div>
            </div>
            <button type="button" className="beauty-ov-card-link" style={{ marginTop: 14 }} onClick={() => onNavigate?.("financeiro")}>
              → {t("modules.xaphiresBeauty.visaoGeral.verRelatorio")}
            </button>
          </div>

          <div className="beauty-card beauty-ov-card">
            <div className="beauty-ov-card-head">
              <h3 className="beauty-ov-card-title">{t("modules.xaphiresBeauty.tabs.equipe")}</h3>
              <span className="beauty-cell-muted">{t(`modules.xaphiresBeauty.visaoGeral.periodo.${periodo}`)}</span>
            </div>
            {semFinanceiro ? (
              <div className="beauty-lock-card">
                <BeautyIcon name="equipe" size={30} />
                <span>{t("modules.xaphiresBeauty.equipe.bloqueado", { plano: t("plan.names.intermediate") })}</span>
              </div>
            ) : desempenhoEquipe.length === 0 ? (
              <p className="beauty-cell-muted" style={{ margin: "10px 0 0" }}>{t("modules.xaphiresBeauty.visaoGeral.equipeVazio")}</p>
            ) : (
              <div>
                {desempenhoEquipe.map((l) => (
                  <div key={l.id} className="beauty-ov-equipe-row">
                    <span className="beauty-ov-staff-avatar" style={{ background: l.cor || "var(--beauty-accent)" }}>{l.nome.charAt(0).toUpperCase()}</span>
                    <div className="beauty-ov-equipe-info">
                      <div className="beauty-ov-equipe-nome">{l.nome}</div>
                      <div className="beauty-ov-equipe-detalhe">
                        {t("modules.xaphiresBeauty.visaoGeral.equipeResumo", { count: l.count, valor: mostrar(formatarValor(l.valorCents, i18n.language)) })}
                      </div>
                    </div>
                    <span className="beauty-ov-equipe-pct">{l.pct}%</span>
                  </div>
                ))}
              </div>
            )}
            {!semFinanceiro && <p className="beauty-ov-equipe-nota">{t("modules.xaphiresBeauty.visaoGeral.equipeConvide")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
