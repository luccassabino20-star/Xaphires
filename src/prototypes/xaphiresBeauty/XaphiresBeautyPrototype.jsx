import "./xaphiresBeauty.css";
import { FEATURE_CATEGORIES, PLAN_LABELS } from "./featuresConfig.js";
import { PlanProvider, UpgradeModal, usePlanContext } from "./PlanContext.jsx";
import FeatureCard from "./FeatureCard.jsx";

// Vitrine do protótipo "Xaphires Beauty" (produto separado do Xaphires real
// - ver comentário em featuresConfig.js). Rota isolada /xaphires-beauty (ver
// main.jsx), sem login, mesmo padrão de GanttChartDemo.jsx: só pra olhar o
// componente, nada aqui grava ou lê dado de verdade.
const PLAN_ORDER = ["gratis", "premium", "profissional"];

function PlanSwitcher() {
  const { plan, setPlan } = usePlanContext();
  return (
    <div className="xb-plan-switcher">
      <span className="xb-plan-switcher-label">Simular plano da clínica:</span>
      <div className="xb-plan-switcher-pills">
        {PLAN_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            className={"xb-plan-switcher-pill" + (p === plan ? " active" : "")}
            onClick={() => setPlan(p)}
          >
            {PLAN_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

function PrototypeBody() {
  return (
    <div className="xb-page">
      <header className="xb-header">
        <span className="xb-eyebrow">Protótipo visual - sem gating real</span>
        <h1>Xaphires Beauty</h1>
        <p>Funcionalidades por plano, organizadas por módulo. Clique num card bloqueado para ver o modal de upgrade.</p>
        <PlanSwitcher />
      </header>

      {FEATURE_CATEGORIES.map((cat) => (
        <section className="xb-category" key={cat.key}>
          <h2 className="xb-category-title">{cat.title}</h2>
          <div className="xb-grid">
            {cat.features.map((f) => (
              <FeatureCard key={f.key} featureKey={f.key} icon={cat.icon} title={f.title} description={f.description} badgeType={f.badge} />
            ))}
          </div>
        </section>
      ))}

      <UpgradeModal />
    </div>
  );
}

export default function XaphiresBeautyPrototype() {
  return (
    <PlanProvider>
      <PrototypeBody />
    </PlanProvider>
  );
}
