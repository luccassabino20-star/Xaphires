// Ícones da sidebar do launcher, no mesmo espírito do ModuleIcon: SVG inline,
// sem biblioteca externa. Só primitivas simples (círculo, retângulo, linha
// reta) de propósito - é o jeito de manter 11 glifos distintos consistentes
// sem depender de path curvo desenhado à mão.
const ICONS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="11" height="11" rx="2" />
      <rect x="16" y="3" width="5" height="5" rx="1" />
      <rect x="16" y="10" width="5" height="4" rx="1" />
      <rect x="3" y="16" width="18" height="5" rx="2" />
    </>
  ),
  consultor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="3" />
      <path d="M8 20l3-4" />
    </>
  ),
  solucoes: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </>
  ),
  formacao: (
    <>
      <path d="M2 9l10-5 10 5-10 5-10-5z" />
      <rect x="6" y="13" width="12" height="5" rx="1" />
    </>
  ),
  mentorias: (
    <>
      <circle cx="8" cy="7" r="3" />
      <rect x="3" y="14" width="10" height="7" rx="4" />
      <circle cx="18" cy="8" r="2.3" />
      <rect x="14" y="15" width="8" height="6" rx="3" />
    </>
  ),
  builder: (
    <>
      <rect x="9" y="4" width="6" height="6" rx="1" />
      <rect x="3" y="14" width="6" height="6" rx="1" />
      <rect x="15" y="14" width="6" height="6" rx="1" />
    </>
  ),
  ferramentas: (
    <>
      <circle cx="7" cy="17" r="3" />
      <path d="M9 15l8-8" />
      <path d="M13 5l3 3-2.2 2.2-3-3z" />
    </>
  ),
  certificados: (
    <>
      <circle cx="12" cy="8" r="5" />
      <path d="M9 12.5 7 21l5-3 5 3-2-8.5" />
    </>
  ),
  metricas: (
    <>
      <path d="M4 21V11" />
      <path d="M12 21V3" />
      <path d="M20 21v-7" />
    </>
  ),
  perfil: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
  atualizacoes: (
    <>
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </>
  ),
};

export default function LauncherSidebarIcon({ name, size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name] || ICONS.solucoes}
      </g>
    </svg>
  );
}
