import { useState } from "react";
import { useTranslation } from "react-i18next";
import ModuleIcon from "../modules/ModuleIcon.jsx";

// Substitui o antigo carrossel (SystemShowcaseCarousel.jsx, arrows/dots/
// autoplay): agora é a pessoa quem escolhe o módulo pelas pílulas da coluna
// esquerda, e a "janela" da direita troca de conteúdo na hora - sem
// temporizador, sem seta. "Automações" e "Relatórios" não são módulos reais
// do Xaphires hoje (Relatórios & BI é uma aba dentro do ERP IRES, ver
// FinanceiroModule.jsx; Automações é a feature de rotinas dentro de um
// quadro) - viraram pílulas mesmo assim porque são o vocabulário de vendas
// pedido; o conteúdo de cada tela é ilustrativo, igual o resto deste mockup.
const MODULES = [
  {
    key: "quadro",
    icon: "quadro",
    tabs: ["Meu quadro", "Todos os quadros", "Relatórios"],
    body: "kanban",
    columns: [
      { title: "A Fazer", accent: "sky", cards: [{ lines: 2, accent: "sky" }, { lines: 1, accent: "amber" }] },
      { title: "Em andamento", accent: "amber", cards: [{ lines: 2, accent: "amber" }] },
      { title: "Concluído", accent: "success", cards: [{ lines: 1, accent: "success" }, { lines: 1, accent: "success" }] },
    ],
  },
  {
    key: "vendas",
    icon: "vendas",
    tabs: ["Funil", "Propostas", "Pedidos"],
    body: "kanban",
    columns: [
      { title: "Leads", accent: "sky", cards: [{ lines: 2, accent: "sky" }, { lines: 1, accent: "sky" }] },
      { title: "Proposta", accent: "amber", cards: [{ lines: 2, accent: "amber" }] },
      { title: "Fechado", accent: "success", cards: [{ lines: 1, accent: "success" }] },
    ],
  },
  {
    key: "financeiro",
    icon: "layers",
    tabs: ["Fluxo de caixa", "Contas a pagar", "DRE"],
    body: "table",
    stats: [
      { label: "Entradas", accent: "success" },
      { label: "Saídas", accent: "amber" },
      { label: "Saldo", accent: "sky" },
    ],
    rows: [
      { accent: "success", wide: true },
      { accent: "amber", wide: false },
      { accent: "success", wide: true },
      { accent: "sky", wide: false },
    ],
  },
  {
    key: "saude",
    icon: "saude",
    tabs: ["Agenda", "Pacientes", "Prontuário"],
    body: "agenda",
    rows: [
      { time: "09:00", accent: "sky" },
      { time: "10:30", accent: "success" },
      { time: "13:00", accent: "amber" },
      { time: "15:15", accent: "sky" },
    ],
  },
  {
    key: "automacoes",
    icon: "automacoes",
    tabs: ["Rotinas", "Gatilhos", "Histórico"],
    body: "automation",
    rows: [{ on: true }, { on: true }, { on: false }, { on: true }],
  },
  {
    key: "relatorios",
    icon: "bi",
    tabs: ["Dashboards", "Indicadores", "Exportar"],
    body: "chart",
    kpis: [
      { label: "Receita", accent: "success" },
      { label: "Ticket médio", accent: "sky" },
    ],
    bars: [38, 72, 54, 90, 65, 48],
  },
];

// Raio pequeno pra "Automações" - único ícone daqui que não existe em
// ModuleIcon.jsx (não é um módulo real, ver comentário acima, então não
// caberia adicionar lá).
function AutomationIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M13 2 3 14h7l-1 8 11-14h-7z" />
    </svg>
  );
}

function DockIcon({ name, size }) {
  if (name === "automacoes") return <AutomationIcon size={size} />;
  return <ModuleIcon name={name} size={size} />;
}

function KanbanBody({ columns }) {
  return (
    <div className="landing-mock-columns">
      {columns.map((col) => (
        <div className="landing-mock-column" key={col.title}>
          <div className="landing-mock-column-head">
            <span>{col.title}</span>
            <span className={"landing-mock-column-dot " + col.accent} />
          </div>
          {col.cards.map((card, i) => (
            <div className="landing-mock-card" key={i}>
              <span className="landing-mock-card-bar" />
              {card.lines > 1 && <span className="landing-mock-card-bar short" />}
              <span className={"landing-mock-card-accent " + card.accent} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TableBody({ stats, rows }) {
  return (
    <div className="landing-mock-table">
      <div className="landing-mock-stats">
        {stats.map((s) => (
          <div className="landing-mock-stat" key={s.label}>
            <span className="landing-mock-stat-label">{s.label}</span>
            <span className={"landing-mock-stat-bar " + s.accent} />
          </div>
        ))}
      </div>
      <div className="landing-mock-rows">
        {rows.map((r, i) => (
          <div className="landing-mock-row" key={i}>
            <span className={"landing-mock-row-dot " + r.accent} />
            <span className={"landing-mock-row-bar" + (r.wide ? " wide" : "")} />
            <span className={"landing-mock-row-value " + r.accent} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AgendaBody({ rows }) {
  return (
    <div className="landing-mock-agenda">
      {rows.map((r, i) => (
        <div className="landing-mock-agenda-row" key={i}>
          <span className="landing-mock-agenda-time">{r.time}</span>
          <span className={"landing-mock-agenda-dot " + r.accent} />
          <span className="landing-mock-agenda-bar" />
        </div>
      ))}
    </div>
  );
}

function AutomationBody({ rows }) {
  return (
    <div className="landing-mock-automation">
      {rows.map((r, i) => (
        <div className="landing-mock-automation-row" key={i}>
          <span className={"landing-mock-toggle" + (r.on ? " on" : "")}>
            <span className="landing-mock-toggle-knob" />
          </span>
          <span className="landing-mock-agenda-bar" />
        </div>
      ))}
    </div>
  );
}

function ChartBody({ kpis, bars }) {
  return (
    <div className="landing-mock-chart-wrap">
      <div className="landing-mock-stats">
        {kpis.map((k) => (
          <div className="landing-mock-stat" key={k.label}>
            <span className="landing-mock-stat-label">{k.label}</span>
            <span className={"landing-mock-stat-bar " + k.accent} />
          </div>
        ))}
      </div>
      <div className="landing-mock-chart">
        {bars.map((h, i) => (
          <span key={i} className="landing-mock-chart-bar" style={{ height: h + "%" }} />
        ))}
      </div>
    </div>
  );
}

// UI demonstrativa estática (dummy component): dock preto + topbar + abas
// (chrome fixo) e um corpo que muda de acordo com o módulo escolhido nas
// pílulas (ver SolutionsShowcaseSection, abaixo). Sem rota, sem estado real,
// sem onClick de verdade - é uma "foto" da interface, mesma lógica do que já
// valia pro carrossel antigo (texto fixo em português, independente do
// locale do site).
function SystemShowcaseMock({ module }) {
  return (
    <div className="landing-mock" aria-hidden="true">
      <aside className="landing-mock-dock">
        <span className="landing-mock-dock-logo">X</span>
        <nav className="landing-mock-dock-nav">
          {MODULES.map((m) => (
            <span key={m.key} className={"landing-mock-dock-item" + (m.key === module.key ? " active" : "")}>
              <DockIcon name={m.icon} size={15} />
            </span>
          ))}
        </nav>
      </aside>

      <div className="landing-mock-main">
        <header className="landing-mock-topbar">
          <button type="button" className="landing-mock-workspace" tabIndex={-1}>
            Xaphires
            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div className="landing-mock-search">
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m21 21-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>Buscar</span>
            <kbd>⌘K</kbd>
          </div>
        </header>

        <nav className="landing-mock-tabs">
          {module.tabs.map((tab, i) => (
            <span key={tab} className={"landing-mock-tab" + (i === 0 ? " active" : "")}>
              {tab}
            </span>
          ))}
        </nav>

        <div className="landing-mock-body">
          {module.body === "kanban" && <KanbanBody columns={module.columns} />}
          {module.body === "table" && <TableBody stats={module.stats} rows={module.rows} />}
          {module.body === "agenda" && <AgendaBody rows={module.rows} />}
          {module.body === "automation" && <AutomationBody rows={module.rows} />}
          {module.body === "chart" && <ChartBody kpis={module.kpis} bars={module.bars} />}

          {module.body === "kanban" && (
            <aside className="landing-mock-drawer">
              <span className="landing-mock-drawer-bar" />
              <span className="landing-mock-drawer-bar short" />
              <span className="landing-mock-drawer-tag" />
              <div className="landing-mock-drawer-foot">
                <span className="landing-mock-drawer-avatar" />
                <span className="landing-mock-drawer-bar tiny" />
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckIcon({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 5 5L19 7" />
    </svg>
  );
}

// Split hero da home: coluna de texto/benefícios/CTA + seletor de módulos à
// esquerda, janela do sistema (SystemShowcaseMock) à direita, trocando junto
// com a pílula ativa. onEnter é o mesmo gatilho do CTA principal do hero
// (App.jsx -> LandingScreen -> AuthScreen), reaproveitado aqui.
export default function SolutionsShowcaseSection({ onEnter }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(MODULES[0].key);
  const activeModule = MODULES.find((m) => m.key === active) || MODULES[0];
  const benefits = t("landing.showcase.benefits", { returnObjects: true });

  return (
    <section className="landing-split-showcase">
      <div className="landing-split-left landing-reveal">
        <span className="landing-split-eyebrow">{t("landing.showcase.eyebrow")}</span>
        <h2>{t("landing.showcase.title")}</h2>

        <ul className="landing-split-benefits">
          {benefits.map((b) => (
            <li key={b.title}>
              <span className="landing-split-check">
                <CheckIcon />
              </span>
              <span>
                <strong>{b.title}</strong> {b.text}
              </span>
            </li>
          ))}
        </ul>

        <div className="landing-split-cta-row">
          <button type="button" className="landing-split-cta-btn" onClick={onEnter}>
            {t("landing.showcase.cta")} →
          </button>
          <span className="landing-split-cta-note">{t("landing.showcase.ctaNote")}</span>
        </div>

        <div className="landing-split-pills-block">
          <span className="landing-split-pills-eyebrow">{t("landing.showcase.pillsEyebrow")}</span>
          <div className="landing-split-pills">
            {MODULES.map((m) => (
              <button
                type="button"
                key={m.key}
                className={"landing-split-pill" + (m.key === active ? " active" : "")}
                onClick={() => setActive(m.key)}
                aria-pressed={m.key === active}
              >
                {m.key === active && <CheckIcon size={11} />}
                {t(`landing.showcase.modules.${m.key}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="landing-split-right landing-reveal">
        <div className="landing-showcase-browser landing-split-window">
          <div className="landing-showcase-browser-bar">
            <span className="landing-showcase-browser-title">
              {t("landing.showcase.windowTitle", { module: t(`landing.showcase.modules.${activeModule.key}`) })}
            </span>
          </div>
          <div className="landing-showcase-screen landing-split-screen">
            <SystemShowcaseMock module={activeModule} />
          </div>
        </div>
      </div>
    </section>
  );
}
