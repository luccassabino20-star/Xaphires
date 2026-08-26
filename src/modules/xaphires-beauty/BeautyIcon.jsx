// Ícones da sidebar do Xaphires Beauty - mesmo padrão sem biblioteca externa
// de CardIcon.jsx (Saúde & Clínicas)/ModuleIcon.jsx: SVG à mão, currentColor,
// traço fino. Conjunto próprio porque tesoura/globo não existem nos outros.
const PATHS = {
  agenda: "M4 5h16v16H4V5zm0 5h16M8 3v4M16 3v4",
  clientes: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0",
  financeiro: "M12 2v2m0 16v2m5-14a4 4 0 0 0-4-3H11a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-1a4 4 0 0 1-4-3",
  equipe: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 10v-2a4 4 0 0 0-3-3.87M15 3.13A4 4 0 0 1 15 10.87",
  // Novos (redesenho do menu): visão geral (grade 2x2), bloqueio (cadeado),
  // anamnese (prancheta), aniversariantes (presente), despesas (nota com
  // seta pra baixo), assinatura (cartão), configurações (engrenagem).
  "visao-geral": "M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z",
  bloqueio: "M6 11V8a6 6 0 0 1 12 0v3M5 11h14v9H5v-9zm7 4v2",
  anamnese: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM6 6h12v14H6V6zm3 5h6M9 14h6M9 17h4",
  aniversariantes: "M12 8V4m0 4c-1 0-2-.9-2-2s1-2 2-2 2 .9 2 2-1 2-2 2zM4 12h16v3H4v-3zm1 3h14v6H5v-6zM4 12c0-1.5 1-2.5 2-2.5s2 1 2 2.5m8 0c0-1.5 1-2.5 2-2.5s2 1 2 2.5",
  despesas: "M4 6h16v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6zM4 6l2-3h12l2 3M12 10v6m-3-3 3 3 3-3",
  assinatura: "M3 6h18v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6zm0 4h18M6 15h4",
  configuracoes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.15-1.5l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-2.6-1.5L14 2h-4l-.35 2.6a7.5 7.5 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5A7.4 7.4 0 0 0 4.6 12a7.4 7.4 0 0 0 .15 1.5l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 0 0 2.6 1.5L10 22h4l.35-2.6a7.5 7.5 0 0 0 2.6-1.5l2.3 1 2-3.4-2-1.5c.1-.5.15-1 .15-1.5z",
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
