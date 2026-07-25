import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher.jsx";

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

function HeroGrid() {
  const [active, setActive] = useState(false);
  const cols = typeof window !== "undefined" && window.innerWidth < 768 ? 6 : 12;

  useEffect(() => {
    const id = setTimeout(() => setActive(true), 100);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="landing-hero-grid" style={{ "--cols": cols }} aria-hidden="true">
      {Array.from({ length: cols }, (_, i) => (
        <div
          key={i}
          className={"landing-hero-col" + (active ? " active" : "")}
          style={{ transitionDelay: `${i * 100}ms` }}
        />
      ))}
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
            <div className="landing-rotator-mark">{item.mark}</div>
            <div className="landing-rotator-bars">
              <div className="landing-rotator-bar" style={{ width: "66%" }} />
              <div className="landing-rotator-bar" style={{ width: "50%" }} />
              <div className="landing-rotator-bar" style={{ width: "75%" }} />
            </div>
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
        <HeroGrid />
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
    </div>
  );
}

function FeaturesPage() {
  const { t } = useTranslation();
  const items = t("landing.features.items", { returnObjects: true });
  const secondary = t("landing.features.secondary", { returnObjects: true });
  const gridRef = useFlashlight();

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
          {plans.map((p) => (
            <div className={"landing-plan-card" + (p.highlight ? " highlight" : "")} key={p.name}>
              {p.highlight && <span className="landing-plan-badge">{t("landing.pricing.mostPopular")}</span>}
              <h3>{p.name}</h3>
              <p className="landing-plan-tagline">{p.tagline}</p>
              <div className="landing-plan-price">
                <span className="landing-plan-price-value">{p.price}</span>
                <span className="landing-plan-price-period">{p.period}</span>
              </div>
              <button className={p.highlight ? "btn-primary" : "btn-secondary"} onClick={onEnter}>
                {p.cta}
              </button>
              <ul className="landing-plan-features">
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ))}
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

  useEffect(() => {
    // O .landing-shell usa scroll-behavior: smooth, então uma rolagem animada até o topo é
    // atropelada pela troca de conteúdo e a nova página abre no meio. "instant" força o salto.
    shellRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [page]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 8);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing-shell" ref={shellRef}>
      <header className={"landing-nav" + (scrolled ? " scrolled" : "")}>
        <div className="landing-nav-brand">
          <span className="landing-nav-icon">C</span>
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
        {/* Sem ThemeToggle aqui: a landing é sempre dark, então o controle não teria efeito
            visível. A troca de tema continua disponível dentro do app. */}
        <div className="landing-nav-actions">
          <LanguageSwitcher />
          <button className="btn-primary btn-small" onClick={onEnter}>
            {t("landing.nav.enter")}
          </button>
        </div>
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
