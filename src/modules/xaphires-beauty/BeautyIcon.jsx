// Ícones da sidebar do Xaphires Beauty - mesmo padrão sem biblioteca externa
// de CardIcon.jsx (Saúde & Clínicas)/ModuleIcon.jsx: SVG à mão, currentColor,
// traço fino. Conjunto próprio porque tesoura/globo não existem nos outros.
const PATHS = {
  agenda: "M4 5h16v16H4V5zm0 5h16M8 3v4M16 3v4",
  clientes: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0",
  financeiro: "M12 2v2m0 16v2m5-14a4 4 0 0 0-4-3H11a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-1a4 4 0 0 1-4-3",
  equipe: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 10v-2a4 4 0 0 0-3-3.87M15 3.13A4 4 0 0 1 15 10.87",
};

export default function BeautyIcon({ name, size = 18 }) {
  const props = { viewBox: "0 0 24 24", width: size, height: size, "aria-hidden": true };
  const strokeProps = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };

  // Tesoura ("servicos"): dois círculos (cabos) + duas lâminas cruzando -
  // única forma composta o bastante para não caber num único <path>.
  if (name === "servicos") {
    return (
      <svg {...props}>
        <circle cx="6.2" cy="6.5" r="2.4" {...strokeProps} />
        <circle cx="6.2" cy="17.5" r="2.4" {...strokeProps} />
        <path d="M20 4.5L8 13.2M8 10.8l12 8.7" {...strokeProps} />
      </svg>
    );
  }
  // Globo ("online"): círculo + equador + meridiano central.
  if (name === "online") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9" {...strokeProps} />
        <path d="M3 12h18M12 3c2.4 2.4 3.7 5.7 3.7 9s-1.3 6.6-3.7 9c-2.4-2.4-3.7-5.7-3.7-9S9.6 5.4 12 3z" {...strokeProps} />
      </svg>
    );
  }
  return <svg {...props}><path d={PATHS[name] || PATHS.agenda} {...strokeProps} /></svg>;
}
