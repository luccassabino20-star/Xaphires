import { PLAN_LABELS } from "./featuresConfig.js";
import { useFeatureAccess } from "./PlanContext.jsx";
import XbIcon from "./icons.jsx";

// Ícone de cadeado - card bloqueado no plano atual.
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 2a4 4 0 0 1 4 4v3h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1V6a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v3h4V6a2 2 0 0 0-2-2z"
      />
    </svg>
  );
}

// Card de funcionalidade reutilizável - props: icon (nome, ver icons.jsx),
// title, description, badgeType ('gratis' | 'premium' | 'profissional').
// featureKey é opcional: só quando presente o card consulta
// useFeatureAccess() e se comporta como bloqueado/clicável pro plano atual
// (ver PlanContext.jsx) - sem ele, o card é só a vitrine visual (usado assim
// nas imagens de referência, sem gating real).
export default function FeatureCard({ icon, title, description, badgeType, featureKey }) {
  const access = useFeatureAccess(featureKey);
  const locked = !access.hasAccess;

  return (
    <div
      className={"xb-card" + (locked ? " xb-card-locked" : "")}
      role={locked ? "button" : undefined}
      tabIndex={locked ? 0 : undefined}
      onClick={locked ? access.requestUpgrade : undefined}
      onKeyDown={locked ? (e) => (e.key === "Enter" || e.key === " ") && access.requestUpgrade() : undefined}
    >
      <div className="xb-card-top">
        <span className="xb-card-icon">
          <XbIcon name={icon} size={20} />
        </span>
        <span className={"xb-badge xb-badge-" + badgeType}>{PLAN_LABELS[badgeType] ?? badgeType}</span>
      </div>
      <h4 className="xb-card-title">{title}</h4>
      <p className="xb-card-desc">{description}</p>
      {locked && (
        <div className="xb-card-lock">
          <LockIcon />
          <span>Disponível no {PLAN_LABELS[badgeType]}</span>
        </div>
      )}
    </div>
  );
}
