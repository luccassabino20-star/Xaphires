// Ícones dos cards da grade de Saúde & Clínicas, mesmo padrão SVG inline do
// ModuleIcon.jsx (sem biblioteca de ícones). Conjunto próprio porque estes são
// específicos do módulo, não de um pilar inteiro.
const PATHS = {
  pacientes: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0",
  anamnese: "M6 2h9l5 5v15H6V2zm9 0v5h5M9 11h6M9 15h6M9 19h3",
  prontuario: "M6 2h12v20H6V2zm3 5h6m-6 4h6m-6 4h4",
  mapeamento: "M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  galeria: "M4 5h7l2-2h4l2 2h1v14H4V5zm8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  lotes: "M4 7l8-4 8 4v10l-8 4-8-4V7zm8-4v18M4 7l8 4 8-4",
  termos: "M7 2h10v20H7V2zm3 6h4M7 11l2 2 3-4",
  antropometria: "M4 20V10m5 10V4m5 16v-7m5 7V8",
  "plano-alimentar": "M12 3v10m0 0c-4 0-6 3-6 6h12c0-3-2-6-6-6zm-5-6c1 2 2 3 5 3s4-1 5-3",
  suplementos: "M9 3h6v5H9zM7 8h10v13H7zM7 13h10",
  agenda: "M4 5h16v16H4V5zm0 5h16M8 3v4M16 3v4",
  pacotes: "M3 7l9-4 9 4v10l-9 4-9-4V7zm9-4v18M3 7l9 4 9-4",
  insumos: "M3 7l9-4 9 4v10l-9 4-9-4V7zm9-4v18M3 7l9 4 9-4",
  // Ícones da sidebar de administração da clínica
  dashboard: "M4 20V10m5 10V4m5 16v-7m5 7V8",
  servicos: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  usuarios: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 10v-2a4 4 0 0 0-3-3.87M15 3.13A4 4 0 0 1 15 10.87",
  config: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  relatorios: "M4 20V10m5 10V4m5 16v-7m5 7V8M4 20h16",
};

export default function CardIcon({ name, size = 20 }) {
  const d = PATHS[name] || PATHS.prontuario;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
