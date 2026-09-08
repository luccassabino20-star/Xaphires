// Ícones do painel admin - traço fino, sem preenchimento, mesmo estilo dos
// SVGs já usados no resto do app (PlanModal, PropertyPopover). Módulo próprio
// (em vez de repetir a função em cada arquivo) porque os mesmos ícones
// aparecem nos três lugares que compõem o painel: AdminApp.jsx (página
// /admin), PlataformaModal.jsx (o mesmo painel embutido no app) e
// Empresas.jsx (menu de ações rápidas da lista).
export function IconLogOut({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
export function IconSearch({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}
export function IconShieldCheck({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
export function IconBuilding2({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v18" />
      <path d="M19 22V10a1 1 0 0 0-1-1h-4" />
      <path d="M10 6h.01M10 10h.01M10 14h.01M10 18h.01" />
    </svg>
  );
}
export function IconMoreHorizontal({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
