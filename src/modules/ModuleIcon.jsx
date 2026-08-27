// Ícones dos pilares, em SVG inline (mesmo padrão do resto do app, que não usa
// biblioteca de ícones). Nome vem de MODULE_META[id].icon.
const PATHS = {
  // Funil de vendas
  vendas: "M3 4h18l-7 8v6l-4 2v-8L3 4z",
  // Três colunas - o quadro Kanban genérico
  quadro: "M4 4h5v16H4zm7.5 0h5v11h-5zM19 4h1v7h-1z",
  // Cifrão / fluxo de caixa
  financeiro: "M12 2v2m0 16v2m5-14a4 4 0 0 0-4-3H11a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-1a4 4 0 0 1-4-3",
  // Camadas empilhadas (losango + dois chevrons) - o card do ERP IRES no
  // launcher usa este em vez do cifrão acima: o cifrão sozinho lia "é só
  // financeiro", e o IRES já é a suíte inteira (Financeiro, Compras & Estoque,
  // Faturamento, Relatórios & BI por dentro - ver FinanceiroModule.jsx).
  layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  // Caixa de estoque
  estoque: "M3 7l9-4 9 4v10l-9 4-9-4V7zm9-4v18M3 7l9 4 9-4",
  // Documento fiscal
  faturamento: "M6 2h9l5 5v15H6V2zm9 0v5h5M9 12h6M9 16h6",
  // Barras de BI
  bi: "M4 20V10m5 10V4m5 16v-7m5 7V8",
  // Cruz médica (contorno de "+"), mesmo traço dos demais ícones do launcher
  saude: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z",
  // Colchetes de código - integrações/automações sob medida
  custom: "M8 4 2 12l6 8M16 4l6 8-6 8",
  // Megafone - campanhas e divulgação
  marketing: "M3 11v2a2 2 0 0 0 2 2h1l2 6h2l-1.5-6H10l9 4V5l-9 4H5a2 2 0 0 0-2 2z",
  // Balança da justiça - contratos e compliance
  juridico: "M12 3v18M5 21h14M12 3 5 8m7-5 7 5M3 8h4l-2 6a2 2 0 0 1-4 0zm14 0h4l-2 6a2 2 0 0 1-4 0z",
  // Brilho/sparkle - Xaphires Beauty (estética suave, mesmo traço do resto)
  beauty: "M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z",
  // Relógio - Xaphires Time & Tracking
  tempo: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l4 2",
};

export default function ModuleIcon({ name, size = 26 }) {
  const d = PATHS[name] || PATHS.vendas;
  const filled = name === "vendas" || name === "beauty";
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d={d}
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
