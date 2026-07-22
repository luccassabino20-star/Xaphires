import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ThemeToggle from "../components/ThemeToggle.jsx";
import LanguageSwitcher from "../components/LanguageSwitcher.jsx";

const NAV_PAGES = ["home", "features", "solutions", "pricing"];

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

  return (
    <>
      <section className="landing-hero">
        <h1>{t("landing.home.heroTitle")}</h1>
        <p>{t("landing.home.heroText")}</p>
        <div className="landing-hero-actions">
          <button className="btn-primary" onClick={onEnter}>
            {t("landing.home.ctaStart")}
          </button>
          <button className="btn-secondary landing-hero-secondary" onClick={() => onNavigate("pricing")}>
            {t("landing.home.ctaPlans")}
          </button>
        </div>
        <p className="landing-hero-note">{t("landing.home.heroNote")}</p>
      </section>

      <section className="landing-stats">
        {stats.map((s) => (
          <StatCard key={s.label} value={s.value} label={s.label} />
        ))}
      </section>

      <section className="landing-benefits">
        {benefits.map((b) => (
          <div className="landing-benefit-item" key={b.title}>
            <h3>{b.title}</h3>
            <p>{b.text}</p>
          </div>
        ))}
      </section>

      <section className="landing-explore">
        <h2>{t("landing.home.exploreTitle")}</h2>
        <div className="landing-explore-grid">
          {exploreLinks.map((e) => (
            <button className="landing-explore-card" key={e.page} onClick={() => onNavigate(e.page)}>
              <span className="landing-feature-badge">{e.badge}</span>
              <h3>{e.title}</h3>
              <p>{e.text}</p>
              <span className="landing-explore-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function FeaturesPage() {
  const { t } = useTranslation();
  const items = t("landing.features.items", { returnObjects: true });
  const secondary = t("landing.features.secondary", { returnObjects: true });

  return (
    <>
      <section className="landing-page-header">
        <h1>{t("landing.features.headerTitle")}</h1>
        <p>{t("landing.features.headerText")}</p>
      </section>

      <section className="landing-features">
        <div className="landing-features-grid">
          {items.map((f) => (
            <div className="landing-feature-card" key={f.title}>
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

function SolutionsPage() {
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
          </div>
        ))}
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

export default function LandingScreen({ onEnter }) {
  const { t } = useTranslation();
  const shellRef = useRef(null);
  const [page, setPage] = useState("home");

  useEffect(() => {
    shellRef.current?.scrollTo({ top: 0 });
  }, [page]);

  return (
    <div className="landing-shell" ref={shellRef}>
      <header className="landing-nav">
        <div className="landing-nav-brand">
          <span className="landing-nav-icon">IMG</span>
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
          <LanguageSwitcher />
          <ThemeToggle />
          <button className="btn-primary btn-small" onClick={onEnter}>
            {t("landing.nav.enter")}
          </button>
        </div>
      </header>

      {page === "home" && <HomePage onEnter={onEnter} onNavigate={setPage} />}
      {page === "features" && <FeaturesPage />}
      {page === "solutions" && <SolutionsPage />}
      {page === "pricing" && <PricingPage onEnter={onEnter} />}

      <footer className="landing-footer">
        <h2>{t("landing.footer.title")}</h2>
        <button className="btn-primary" onClick={onEnter}>
          {t("landing.footer.cta")}
        </button>
      </footer>
    </div>
  );
}
