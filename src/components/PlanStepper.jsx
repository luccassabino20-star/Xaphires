import { useTranslation } from "react-i18next";

// Indicador de progresso do fluxo de contratação (Plano -> Módulos & Add-ons ->
// Pagamento), reaproveitado pelo passo de seleção de módulo dentro do
// PlanModal e pelo CheckoutModal - são dois componentes/modais distintos (o
// checkout abre por cima do plano, não é um passo interno do mesmo React
// tree), então o stepper vive aqui, sozinho, pros dois importarem em vez de
// duplicar o JSX/lógica de "qual passo está atual".
export default function PlanStepper({ current }) {
  const { t } = useTranslation();
  const steps = [1, 2, 3].map((n) => ({ n, label: t(`plan.stepper.step${n}`) }));

  return (
    <ol className="premium-stepper">
      {steps.map((s, i) => (
        <li
          className={"premium-stepper-item" + (s.n < current ? " done" : s.n === current ? " current" : "")}
          key={s.n}
        >
          <span className="premium-stepper-dot">
            {s.n < current ? (
              <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
                <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 5 5L19 7" />
              </svg>
            ) : (
              s.n
            )}
          </span>
          <span className="premium-stepper-label">{s.label}</span>
          {i < steps.length - 1 && <span className="premium-stepper-line" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}
