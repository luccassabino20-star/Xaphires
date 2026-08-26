import { createContext, useContext, useState } from "react";
import { PLAN_LEVEL, PLAN_LABELS, FEATURE_CATEGORIES } from "./featuresConfig.js";

// Contexto local só deste protótipo - simula "o plano atual da clínica
// assinante" com estado em memória (trocado pelo seletor de plano na tela de
// demonstração), sem ler nem gravar nada real. Não é o AuthContext/plano do
// Xaphires de verdade: aqui não há assinatura nem servidor por trás, ver
// comentário no topo de featuresConfig.js.
const PlanContext = createContext(null);

// Indexado uma vez por chave de feature, pra useFeatureAccess não precisar
// varrer as categorias inteiras a cada chamada.
const FEATURE_INDEX = FEATURE_CATEGORIES.reduce((acc, cat) => {
  cat.features.forEach((f) => {
    acc[f.key] = f;
  });
  return acc;
}, {});

export function PlanProvider({ children }) {
  const [plan, setPlan] = useState("gratis");
  const [upgradeTarget, setUpgradeTarget] = useState(null); // { featureTitle, requiredPlan } | null

  function requestUpgrade(featureTitle, requiredPlan) {
    setUpgradeTarget({ featureTitle, requiredPlan });
  }

  return (
    <PlanContext.Provider value={{ plan, setPlan, upgradeTarget, requestUpgrade, closeUpgrade: () => setUpgradeTarget(null) }}>
      {children}
    </PlanContext.Provider>
  );
}

// Hook central: dado o featureKey (ver featuresConfig.js), diz se o plano
// atual libera o recurso. requestUpgrade() dispara o modal de upgrade - quem
// chama decide quando (ex.: onClick de um card bloqueado). featureKey
// ausente (undefined/null) sempre libera - chamado incondicionalmente por
// FeatureCard mesmo em cards puramente visuais, sem featureKey, pra não
// infringir a regra de hooks (chamar hook dentro de "if").
export function useFeatureAccess(featureKey) {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("useFeatureAccess precisa estar dentro de <PlanProvider>");
  const feature = featureKey ? FEATURE_INDEX[featureKey] : null;
  const requiredPlan = feature?.badge ?? "gratis";
  const hasAccess = !featureKey || PLAN_LEVEL[ctx.plan] >= PLAN_LEVEL[requiredPlan];

  return {
    hasAccess,
    requiredPlan,
    requiredPlanLabel: PLAN_LABELS[requiredPlan],
    currentPlan: ctx.plan,
    requestUpgrade: () => ctx.requestUpgrade(feature?.title ?? featureKey, requiredPlan),
  };
}

export function usePlanContext() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlanContext precisa estar dentro de <PlanProvider>");
  return ctx;
}

// Modal de upgrade - texto genérico pedido ("Faça upgrade para o plano X
// para liberar este recurso"), sem link de checkout real (não existe
// cobrança neste protótipo).
export function UpgradeModal() {
  const { upgradeTarget, closeUpgrade, setPlan } = usePlanContext();
  if (!upgradeTarget) return null;
  const { featureTitle, requiredPlan } = upgradeTarget;
  const label = PLAN_LABELS[requiredPlan];

  return (
    <div className="xb-modal-overlay" onClick={closeUpgrade}>
      <div className="xb-modal" onClick={(e) => e.stopPropagation()}>
        <span className={"xb-badge xb-badge-" + requiredPlan}>{label}</span>
        <h3>Recurso do plano {label}</h3>
        <p>
          Faça upgrade para o plano <strong>{label}</strong> para liberar “{featureTitle}”.
        </p>
        <div className="xb-modal-actions">
          <button type="button" className="xb-btn-ghost" onClick={closeUpgrade}>
            Agora não
          </button>
          <button
            type="button"
            className="xb-btn-primary"
            onClick={() => {
              setPlan(requiredPlan);
              closeUpgrade();
            }}
          >
            Simular upgrade para {label}
          </button>
        </div>
      </div>
    </div>
  );
}
