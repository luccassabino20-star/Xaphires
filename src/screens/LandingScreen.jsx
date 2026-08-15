import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher.jsx";
import LandingThemeToggle from "../components/LandingThemeToggle.jsx";
import PromoPopup from "../components/PromoPopup.jsx";
import { WHATSAPP_VENDAS_URL } from "../utils/contact.js";

const NAV_PAGES = ["home", "features", "solutions", "pricing"];

function useReveal() {
  const containerRef = useRef(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const targets = root.querySelectorAll(".landing-reveal");
    if (targets.length === 0) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return containerRef;
}

// O brilho dos cards .landing-flash é um radial-gradient posicionado por --mouse-x/--mouse-y.
// Um único listener no container atualiza todos os cards, em vez de um por card.
function useFlashlight() {
  const containerRef = useRef(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    function handleMove(e) {
      root.querySelectorAll(".landing-flash").forEach((card) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
        card.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
      });
    }

    root.addEventListener("mousemove", handleMove);
    return () => root.removeEventListener("mousemove", handleMove);
  }, []);

  return containerRef;
}

// Quebra o título em palavras e depois em caracteres. A quebra por palavra existe para o
// texto poder quebrar linha normalmente — dividir só por caractere parte palavras no meio.
function RevealTitle({ text }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setRevealed(true), 100);
    return () => clearTimeout(id);
  }, []);

  const words = String(text).split(" ");
  let charIndex = 0;

  return (
    <>
      {words.map((word, w) => (
        <Fragment key={`${word}-${w}`}>
          {w > 0 && " "}
          <span className="landing-char-word">
            {[...word].map((char, c) => {
              const delay = charIndex++ * 30;
              return (
                <span
                  key={c}
                  className={"landing-char" + (revealed ? " revealed" : "")}
                  style={{ transitionDelay: `${delay}ms` }}
                >
                  {char}
                </span>
              );
            })}
          </span>
        </Fragment>
      ))}
    </>
  );
}

// Prova visual do hero: uma miniatura do quadro real, não uma ilustração
// genérica. É markup próprio (não o CardItem de verdade) de propósito - decorativo
// e sem estado, para não carregar contexto de quadro na landing só para isto.
// As cores das colunas/avatares são só visuais, sem ligação com dado nenhum -
// por isso aria-hidden: quem lê por leitor de tela já tem a proposta de valor
// no texto do hero, este bloco só repete visualmente.
function HeroBoardPreview() {
  const { t } = useTranslation();
  const columns = t("landing.home.boardPreview.columns", { returnObjects: true });

  return (
    <div className="landing-board-preview landing-reveal" style={{ transitionDelay: "300ms" }} aria-hidden="true">
      <div className="landing-board-preview-chrome">
        <span className="landing-board-preview-dot dot-a" />
        <span className="landing-board-preview-dot dot-b" />
        <span className="landing-board-preview-dot dot-c" />
      </div>
      <div className="landing-board-preview-board">
        {columns.map((col, ci) => (
          <div className="landing-board-preview-col" key={col.title}>
            <div className="landing-board-preview-col-head">
              <span>{col.title}</span>
              <span className="landing-board-preview-count">{col.cards.length}</span>
            </div>
            {col.cards.map((card, cardi) => (
              <div className={"landing-board-preview-card" + (card.done ? " done" : "")} key={card.title}>
                <span className={"landing-board-preview-bar bar-" + ((ci + cardi) % 3)} />
                <p>{card.title}</p>
                <div className="landing-board-preview-card-footer">
                  <span className="landing-board-preview-badge">{card.badge}</span>
                  <span className={"landing-board-preview-avatar avatar-" + ((ci + cardi) % 3)}>{card.initials}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Dias do cabeçalho são só dígitos decorativos (sem mês/ano) - não precisam de
// tradução, e propositalmente não usam a data real de hoje: um mockup "hoje"
// fixo no dia 21 de outubro ficaria óbvio e datado assim que a página
// envelhecesse um pouco. GANTT_TODAY_INDEX marca onde a linha "hoje" cai
// dentro de GANTT_DAYS, e as barras (ver ganttPreview.rows no locale) usam
// left/width em % desse mesmo intervalo de 10 dias.
const GANTT_DAYS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const GANTT_TODAY_INDEX = 4;
const GANTT_BAR_SPANS = [
  { left: 0, width: 30 },
  { left: 20, width: 40 },
  { left: 50, width: 30 },
  { left: 70, width: 20 },
];

// Segunda prova visual, mesma lógica da HeroBoardPreview: markup próprio (não
// o GanttChart de verdade) que reaproveita a paleta real de status
// (ganttStatus.js) e a linha "hoje" coral do Gantt de verdade, para não
// desalinhar visualmente se aquela paleta mudar. A quarta linha usa o mesmo
// tom pastel de .gnt-bar-child, para sugerir hierarquia (tarefa vs.
// subtarefa) sem precisar simular o recolher/expandir de verdade.
function GanttPreview() {
  const { t } = useTranslation();
  const rows = t("landing.features.ganttPreview.rows", { returnObjects: true });
  const todayLeft = GANTT_TODAY_INDEX * 10;

  // Sem .landing-reveal aqui de propósito: essa classe só ganha .is-visible
  // pelo IntersectionObserver que useReveal() monta, e quem chama esta função
  // é FeaturesPage, que nunca usa useReveal() (só HomePage usa, para o hero e
  // afins) - com a classe, este bloco ficava preso em opacity:0 pra sempre,
  // presente no DOM mas invisível. Foi assim que o preview "sumiu".
  return (
    <div className="landing-board-preview" aria-hidden="true">
      <div className="landing-board-preview-chrome">
        <span className="landing-board-preview-dot dot-a" />
        <span className="landing-board-preview-dot dot-b" />
        <span className="landing-board-preview-dot dot-c" />
      </div>
      <div className="landing-gantt-preview-body">
        <div className="landing-gantt-preview-sidebar">
          {rows.map((row) => (
            <div className="landing-gantt-preview-sidebar-row" key={row.title}>
              {row.title}
            </div>
          ))}
        </div>
        <div className="landing-gantt-preview-chart">
          <div className="landing-gantt-preview-header">
            {GANTT_DAYS.map((day, i) => (
              <span key={i} className="landing-gantt-preview-day">
                {day}
              </span>
            ))}
            <span className="landing-gantt-preview-today-pill" style={{ left: todayLeft + "%" }}>
              {t("datePicker.today")}
            </span>
          </div>
          <div className="landing-gantt-preview-rows">
            <span className="landing-gantt-preview-today-line" style={{ left: todayLeft + "%" }} />
            {rows.map((row, i) => (
              <div className="landing-gantt-preview-row" key={row.title}>
                <span
                  className={"landing-gantt-preview-bar" + (row.child ? " child" : " status-" + row.status)}
                  style={{ left: GANTT_BAR_SPANS[i].left + "%", width: GANTT_BAR_SPANS[i].width + "%" }}
                >
                  {!row.child && row.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoMarquee() {
  const { t } = useTranslation();
  const label = t("landing.logos.label");
  const items = t("landing.logos.items", { returnObjects: true });

  // O keyframe desloca -50%, então a faixa precisa de exatamente duas cópias
  // para o ponto de retorno coincidir com o início e o loop não dar salto.
  const group = (copy) => (
    <div className="landing-logos-group" aria-hidden={copy > 0 ? "true" : undefined}>
      {items.map((item) => (
        <span className="landing-logo-item" key={`${copy}-${item}`}>
          {item}
        </span>
      ))}
    </div>
  );

  return (
    <section className="landing-logos">
      <p className="landing-logos-label landing-reveal">{label}</p>
      <div className="landing-marquee">
        <div className="landing-marquee-track">
          {group(0)}
          {group(1)}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const { t } = useTranslation();
  const title = t("landing.testimonials.title");
  const items = t("landing.testimonials.items", { returnObjects: true });

  const group = (copy) => items.map((item, i) => (
    <div className="landing-testimonial-card" key={`${copy}-${i}`} aria-hidden={copy > 0 ? "true" : undefined}>
      <p>{item.quote}</p>
      <div className="landing-testimonial-author">
        <div className="landing-testimonial-avatar">{item.name.charAt(0)}</div>
        <div>
          <div className="landing-testimonial-name">{item.name}</div>
          <div className="landing-testimonial-role">{item.role}</div>
        </div>
      </div>
    </div>
  ));

  return (
    <section className="landing-testimonials">
      <h2 className="landing-testimonials-title landing-reveal">{title}</h2>
      <div className="landing-marquee">
        <div className="landing-marquee-track" style={{ "--speed": "50s" }}>
          {group(0)}
          {group(1)}
        </div>
      </div>
    </section>
  );
}

// <details>/<summary> nativo: acordeão sem estado próprio, com abrir/fechar por
// teclado de graça. Cada item some sozinho quando outro abre (attribute "name"
// agrupa os <details>, suportado desde 2023 nos motores principais) - sem isso
// a página deixaria vários abertos ao mesmo tempo, empurrando o conteúdo.
function Faq() {
  const { t } = useTranslation();
  const title = t("landing.home.faq.title");
  const items = t("landing.home.faq.items", { returnObjects: true });

  return (
    <section className="landing-faq">
      <h2 className="landing-reveal">{title}</h2>
      <div className="landing-faq-list">
        {items.map((item, i) => (
          <details className="landing-faq-item landing-reveal" name="landing-faq" style={{ transitionDelay: `${i * 60}ms` }} key={item.q}>
            <summary>
              {item.q}
              <span className="landing-faq-icon" aria-hidden="true" />
            </summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// Ícone por item do FeatureSwitcher: um pictograma coerente com a descrição
// (sincronia, escudo de acesso, gráfico de painel) no lugar de uma letra
// abstrata. Inline e sem lib de ícones, no mesmo espírito das outras provas
// visuais desta página.
function RotatorIcon({ itemKey }) {
  if (itemKey === "access") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
        <path d="m9.5 12 1.8 1.8L14.8 10" />
      </svg>
    );
  }
  if (itemKey === "insights") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

// Miniatura central do card, uma por item - mesma lógica de HeroBoardPreview/
// GanttPreview: markup e cores reais do app (avatares, papéis de
// board.share) em vez de barras genéricas, para a imagem condizer com o que
// o texto descreve.
function RotatorVisual({ itemKey }) {
  const { t } = useTranslation();

  if (itemKey === "access") {
    const rows = [
      { initials: "A", cls: "avatar-0", role: t("board.share.roleOwner") },
      { initials: "B", cls: "avatar-1", role: t("board.share.roleEditor") },
      { initials: "C", cls: "avatar-2", role: t("board.share.roleViewer") },
    ];
    return (
      <div className="landing-rotator-visual access">
        {rows.map((row) => (
          <div className="landing-rotator-access-row" key={row.role}>
            <span className={"landing-board-preview-avatar " + row.cls}>{row.initials}</span>
            <span className="landing-rotator-access-name" />
            <span className="landing-rotator-access-role">{row.role}</span>
          </div>
        ))}
      </div>
    );
  }

  if (itemKey === "insights") {
    return (
      <div className="landing-rotator-visual insights">
        <div className="landing-rotator-chart">
          {[38, 72, 54, 90].map((h, i) => (
            <span key={i} className="landing-rotator-chart-bar" style={{ height: h + "%" }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="landing-rotator-visual sync">
      <div className="landing-rotator-sync-card">
        <span className="landing-rotator-sync-bar" />
        <span className="landing-rotator-sync-bar short" />
      </div>
      <div className="landing-rotator-sync-avatars">
        <span className="landing-board-preview-avatar avatar-0">A</span>
        <span className="landing-board-preview-avatar avatar-1">B</span>
        <span className="landing-rotator-sync-pulse" aria-hidden="true" />
      </div>
    </div>
  );
}

function FeatureSwitcher() {
  const { t } = useTranslation();
  const title = t("landing.switcher.title");
  const text = t("landing.switcher.text");
  const items = t("landing.switcher.items", { returnObjects: true });
  const [active, setActive] = useState(0);

  // Reagenda a cada troca, então um clique manual também reinicia a contagem.
  useEffect(() => {
    const id = setTimeout(() => setActive((a) => (a + 1) % items.length), 5000);
    return () => clearTimeout(id);
  }, [active, items.length]);

  const go = (delta) => setActive((a) => (a + delta + items.length) % items.length);

  return (
    <section className="landing-switcher">
      <div className="landing-switcher-intro landing-reveal">
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="landing-switcher-list">
          {items.map((item, i) => (
            <button
              type="button"
              key={item.key}
              className={"landing-switcher-btn" + (i === active ? " active" : "")}
              onClick={() => setActive(i)}
              aria-pressed={i === active}
            >
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="landing-rotator landing-reveal">
        {items.map((item, i) => (
          <div
            key={item.key}
            className={"landing-rotator-card" + (i === active ? " active" : "")}
            aria-hidden={i === active ? undefined : "true"}
          >
            <div className="landing-rotator-mark">
              <RotatorIcon itemKey={item.key} />
            </div>
            <RotatorVisual itemKey={item.key} />
            <div className="landing-rotator-status">
              <span>{item.statusLabel}</span>
              <span>{item.statusValue}</span>
            </div>
          </div>
        ))}
        <div className="landing-rotator-nav">
          <button type="button" onClick={() => go(-1)} aria-label={t("common.previous", "Anterior")}>
            ‹
          </button>
          <button type="button" onClick={() => go(1)} aria-label={t("common.next", "Próximo")}>
            ›
          </button>
        </div>
      </div>
    </section>
  );
}

function StatCard({ value, label }) {
  const ref = useRef(null);

  function handleMove(e) {
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 14).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 14).toFixed(2)}deg`);
    el.style.setProperty("--tx", `${(x * 18).toFixed(2)}px`);
    el.style.setProperty("--ty", `${(y * 18).toFixed(2)}px`);
  }

  function handleLeave() {
    const el = ref.current;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--tx", "0px");
    el.style.setProperty("--ty", "0px");
  }

  return (
    <div className="landing-stat-card" ref={ref} onMouseMove={handleMove} onMouseLeave={handleLeave}>
      <span className="landing-stat-value">{value}</span>
      <span className="landing-stat-label">{label}</span>
    </div>
  );
}

function HomePage({ onEnter, onNavigate }) {
  const { t } = useTranslation();
  const stats = t("landing.home.stats", { returnObjects: true });
  const benefits = t("landing.home.benefits", { returnObjects: true });
  const exploreLinks = t("landing.home.exploreLinks", { returnObjects: true });
  const revealRef = useReveal();
  const benefitsRef = useFlashlight();
  const exploreRef = useFlashlight();

  return (
    <div ref={revealRef}>
      {/* O hero não usa .landing-reveal: a entrada dele é o reveal letra a letra do título. */}
      <section className="landing-hero landing-hero-main">
        <h1>
          <RevealTitle text={t("landing.home.heroTitle")} />
        </h1>
        <p className="landing-reveal" style={{ transitionDelay: "200ms" }}>
          {t("landing.home.heroText")}
        </p>
        <div className="landing-hero-actions landing-reveal" style={{ transitionDelay: "400ms" }}>
          <button className="btn-primary" onClick={onEnter}>
            {t("landing.home.ctaStart")}
          </button>
          <button className="btn-secondary landing-hero-secondary" onClick={() => onNavigate("pricing")}>
            {t("landing.home.ctaPlans")}
          </button>
        </div>
        <p className="landing-hero-note landing-reveal" style={{ transitionDelay: "500ms" }}>
          {t("landing.home.heroNote")}
        </p>
      </section>

      <HeroBoardPreview />

      <LogoMarquee />

      <section className="landing-stats">
        {stats.map((s, i) => (
          <div className="landing-reveal" style={{ transitionDelay: `${i * 80}ms` }} key={s.label}>
            <StatCard value={s.value} label={s.label} />
          </div>
        ))}
      </section>

      <FeatureSwitcher />

      <section className="landing-benefits" ref={benefitsRef}>
        {benefits.map((b, i) => (
          <div
            className="landing-benefit-item landing-flash landing-reveal"
            style={{ transitionDelay: `${i * 80}ms` }}
            key={b.title}
          >
            <div className="landing-flash-border" />
            <h3>{b.title}</h3>
            <p>{b.text}</p>
          </div>
        ))}
      </section>

      <section className="landing-explore">
        <h2 className="landing-reveal">{t("landing.home.exploreTitle")}</h2>
        <div className="landing-explore-grid" ref={exploreRef}>
          {exploreLinks.map((e, i) => (
            <div className="landing-reveal" style={{ transitionDelay: `${i * 80}ms` }} key={e.page}>
              <button className="landing-explore-card landing-flash" onClick={() => onNavigate(e.page)}>
                <div className="landing-flash-border" />
                <span className="landing-feature-badge">{e.badge}</span>
                <h3>{e.title}</h3>
                <p>{e.text}</p>
                <span className="landing-explore-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      <Testimonials />

      <Faq />
    </div>
  );
}

function FeaturesPage() {
  const { t } = useTranslation();
  const items = t("landing.features.items", { returnObjects: true });
  const automations = t("landing.features.automations", { returnObjects: true });
  const secondary = t("landing.features.secondary", { returnObjects: true });
  const gridRef = useFlashlight();
  // Grade própria: o flashlight percorre os cards do container onde está montado.
  const autoRef = useFlashlight();

  return (
    <>
      <section className="landing-page-header">
        <h1>{t("landing.features.headerTitle")}</h1>
        <p>{t("landing.features.headerText")}</p>
      </section>

      <section className="landing-features">
        <div className="landing-features-grid" ref={gridRef}>
          {items.map((f) => (
            <div className="landing-feature-card landing-flash" key={f.title}>
              <div className="landing-flash-border" />
              <span className="landing-feature-badge">{f.badge}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-features">
        <h2 className="landing-features-title">{t("landing.features.ganttPreview.title")}</h2>
        <p className="landing-features-subtitle">{t("landing.features.ganttPreview.text")}</p>
        <GanttPreview />
      </section>

      {/* As visões acima respondem "como eu olho o trabalho"; estas respondem
          "o que o sistema faz sozinho". Separar deixa a diferença explícita. */}
      <section className="landing-features">
        <h2 className="landing-features-title">{t("landing.features.automationsTitle")}</h2>
        <p className="landing-features-subtitle">{t("landing.features.automationsText")}</p>
        <div className="landing-features-grid" ref={autoRef}>
          {automations.map((f) => (
            <div className="landing-feature-card landing-flash" key={f.title}>
              <div className="landing-flash-border" />
              <span className="landing-feature-badge">{f.badge}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-secondary">
        {secondary.map((s) => (
          <div className="landing-secondary-item" key={s.title}>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </div>
        ))}
      </section>
    </>
  );
}

function SolutionsPage({ onNavigate }) {
  const { t } = useTranslation();
  const items = t("landing.solutions.items", { returnObjects: true });

  return (
    <>
      <section className="landing-page-header">
        <h1>{t("landing.solutions.headerTitle")}</h1>
        <p>{t("landing.solutions.headerText")}</p>
      </section>

      <section className="landing-solutions">
        {items.map((s) => (
          <div className="landing-solution-card" key={s.title}>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
            <div className="landing-solution-tags">
              {s.tags.map((tag) => (
                <span className="landing-solution-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            {s.page && (
              <button type="button" className="landing-solution-link" onClick={() => onNavigate(s.page)}>
                {t("landing.solutions.learnMore")} →
              </button>
            )}
          </div>
        ))}
      </section>
    </>
  );
}

function ProductTeamsPage({ onEnter, onNavigate }) {
  const { t } = useTranslation();
  const templates = t("landing.productTeams.templates", { returnObjects: true });
  const extra = t("landing.productTeams.extra", { returnObjects: true });

  return (
    <>
      <section className="landing-back-link-row">
        <button type="button" className="landing-back-link" onClick={() => onNavigate("solutions")}>
          {t("landing.productTeams.backLink")}
        </button>
      </section>

      <section className="landing-hero">
        <span className="landing-pill-badge">{t("landing.productTeams.badge")}</span>
        <h1>{t("landing.productTeams.heroTitle")}</h1>
        <p>{t("landing.productTeams.heroText")}</p>
        <div className="landing-hero-actions">
          <button className="btn-primary" onClick={onEnter}>
            {t("landing.productTeams.ctaStart")}
          </button>
          <button className="btn-secondary landing-hero-secondary" onClick={() => onNavigate("pricing")}>
            {t("landing.productTeams.ctaPlans")}
          </button>
        </div>
      </section>

      <section className="landing-features">
        <h2 className="landing-features-title">{t("landing.productTeams.templatesTitle")}</h2>
        <div className="landing-features-grid">
          {templates.map((tpl) => (
            <div className="landing-feature-card" key={tpl.title}>
              <span className="landing-feature-badge">{tpl.badge}</span>
              <h3>{tpl.title}</h3>
              <p>{tpl.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-page-header">
        <span className="landing-pill-badge">{t("landing.productTeams.timelineBadge")}</span>
        <h1>{t("landing.productTeams.timelineTitle")}</h1>
        <p>{t("landing.productTeams.timelineText")}</p>
      </section>

      <section className="landing-secondary-section">
        <h2 className="landing-features-title">{t("landing.productTeams.extraTitle")}</h2>
        <div className="landing-secondary">
          {extra.map((e) => (
            <div className="landing-secondary-item" key={e.title}>
              <h3>{e.title}</h3>
              <p>{e.text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function PricingPage({ onEnter }) {
  const { t } = useTranslation();
  const plans = t("landing.pricing.plans", { returnObjects: true });

  return (
    <>
      <section className="landing-page-header">
        <h1>{t("landing.pricing.headerTitle")}</h1>
        <p>{t("landing.pricing.headerText")}</p>
      </section>

      <section className="landing-pricing">
        <div className="landing-pricing-grid">
          {plans.map((p, i) => {
            // Só o último plano (Empresarial) fala com vendas; os demais entram direto no cadastro.
            const isVendas = i === plans.length - 1;
            const ctaClass = p.highlight ? "btn-primary" : "btn-secondary";
            return (
              <div className={"landing-plan-card" + (p.highlight ? " highlight" : "")} key={p.name}>
                {p.highlight && <span className="landing-plan-badge">{t("landing.pricing.mostPopular")}</span>}
                <h3>{p.name}</h3>
                <p className="landing-plan-tagline">{p.tagline}</p>
                <div className="landing-plan-price">
                  <span className="landing-plan-price-value">{p.price}</span>
                  <span className="landing-plan-price-period">{p.period}</span>
                </div>
                {isVendas ? (
                  <a className={ctaClass} href={WHATSAPP_VENDAS_URL} target="_blank" rel="noopener noreferrer">
                    {p.cta}
                  </a>
                ) : (
                  <button className={ctaClass} onClick={onEnter}>
                    {p.cta}
                  </button>
                )}
                {/* Só os planos com período de teste trazem essa nota. */}
                {p.note && <p className="landing-plan-note">{p.note}</p>}
                <ul className="landing-plan-features">
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function PrivacyPage({ onNavigate }) {
  const { t } = useTranslation();
  const sections = t("landing.privacy.sections", { returnObjects: true });

  return (
    <>
      <section className="landing-back-link-row">
        <button type="button" className="landing-back-link" onClick={() => onNavigate("home")}>
          {t("landing.privacy.backLink")}
        </button>
      </section>

      <section className="landing-page-header">
        <h1>{t("landing.privacy.headerTitle")}</h1>
        <p>{t("landing.privacy.headerText")}</p>
        <p className="landing-legal-updated">
          {t("landing.privacy.updatedLabel")}: {t("landing.privacy.updatedDate")}
        </p>
      </section>

      <section className="landing-legal">
        {sections.map((s) => (
          <div className="landing-legal-section" key={s.title}>
            <h2>{s.title}</h2>
            {s.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {s.bullets && (
              <ul>
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </>
  );
}

export default function LandingScreen({ onEnter }) {
  const { t } = useTranslation();
  const shellRef = useRef(null);
  const [page, setPage] = useState("home");
  const [scrolled, setScrolled] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    // O .landing-shell usa scroll-behavior: smooth, então uma rolagem animada até o topo é
    // atropelada pela troca de conteúdo e a nova página abre no meio. "instant" força o salto.
    shellRef.current?.scrollTo({ top: 0, behavior: "instant" });
    // O menu mobile é por página, não por sessão: trocar de página sem fechar deixaria
    // o painel sobreposto ao conteúdo novo.
    setNavOpen(false);
  }, [page]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 8);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Gira --beam-angle (o feixe que percorre a borda dos CTAs) via rAF em vez de @keyframes:
  // ver o comentário de ".landing-beam" em index.css sobre o Chrome não repintar a animação CSS.
  useEffect(() => {
    const root = shellRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const BEAM_SELECTOR = ".btn-primary, .btn-secondary";
    const BEAM_DURATION_MS = 2000;
    let target = null;
    let start = 0;
    let raf = null;

    const tick = (now) => {
      if (!target) return;
      const angle = (((now - start) % BEAM_DURATION_MS) / BEAM_DURATION_MS) * 360;
      target.style.setProperty("--beam-angle", angle + "deg");
      raf = requestAnimationFrame(tick);
    };

    const onOver = (e) => {
      const btn = e.target.closest(BEAM_SELECTOR);
      if (!btn || !root.contains(btn) || btn === target) return;
      target = btn;
      start = performance.now();
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    const onOut = (e) => {
      const btn = e.target.closest(BEAM_SELECTOR);
      if (!btn || btn !== target || btn.contains(e.relatedTarget)) return;
      target = null;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      btn.style.removeProperty("--beam-angle");
    };

    root.addEventListener("mouseover", onOver);
    root.addEventListener("mouseout", onOut);
    return () => {
      root.removeEventListener("mouseover", onOver);
      root.removeEventListener("mouseout", onOut);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="landing-shell" ref={shellRef}>
      <PromoPopup onEnter={onEnter} />
      <header className={"landing-nav" + (scrolled ? " scrolled" : "")}>
        <div className="landing-nav-brand">
          <span className="landing-nav-icon">X</span>
          <span>{t("landing.nav.brand")}</span>
        </div>
        <nav className="landing-nav-links">
          {NAV_PAGES.map((p) => (
            <button
              key={p}
              className={"landing-nav-link" + (page === p ? " active" : "")}
              onClick={() => setPage(p)}
            >
              {t(`landing.nav.${p}`)}
            </button>
          ))}
        </nav>
        <div className="landing-nav-actions">
          <LandingThemeToggle />
          <LanguageSwitcher />
          <button className="btn-primary btn-small" onClick={onEnter}>
            {t("landing.nav.enter")}
          </button>
        </div>
        {/* Só existe espaço para a marca e um botão no cabeçalho estreito - o resto
            (páginas, idioma, tema, entrar) migra para este painel, que sobrepõe o
            conteúdo em vez de disputar largura com ele. */}
        <button
          type="button"
          className="landing-nav-hamburger"
          onClick={() => setNavOpen((o) => !o)}
          aria-label={t("app.topbar.menu")}
          aria-expanded={navOpen}
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
          </svg>
        </button>
        {navOpen && (
          <div className="landing-nav-mobile">
            {NAV_PAGES.map((p) => (
              <button
                key={p}
                className={"landing-nav-mobile-link" + (page === p ? " active" : "")}
                onClick={() => setPage(p)}
              >
                {t(`landing.nav.${p}`)}
              </button>
            ))}
            <div className="landing-nav-mobile-actions">
              <LandingThemeToggle />
              <LanguageSwitcher />
            </div>
            <button
              className="btn-primary"
              onClick={() => {
                setNavOpen(false);
                onEnter();
              }}
            >
              {t("landing.nav.enter")}
            </button>
          </div>
        )}
      </header>

      {page === "home" && <HomePage onEnter={onEnter} onNavigate={setPage} />}
      {page === "features" && <FeaturesPage />}
      {page === "solutions" && <SolutionsPage onNavigate={setPage} />}
      {page === "productTeams" && <ProductTeamsPage onEnter={onEnter} onNavigate={setPage} />}
      {page === "pricing" && <PricingPage onEnter={onEnter} />}
      {page === "privacy" && <PrivacyPage onNavigate={setPage} />}

      <footer className="landing-footer">
        <h2>{t("landing.footer.title")}</h2>
        <button className="btn-primary" onClick={onEnter}>
          {t("landing.footer.cta")}
        </button>
        <nav className="landing-footer-links">
          <button type="button" className="landing-footer-link" onClick={() => setPage("privacy")}>
            {t("landing.footer.privacy")}
          </button>
        </nav>
        <p className="landing-footer-copyright">{t("landing.footer.copyright")}</p>
      </footer>
    </div>
  );
}
