export const BACKGROUND_COLORS = [
  { id: "slate", css: "#44444c" },
  { id: "blue", css: "#4d7ea8" },
  { id: "green", css: "#5a9c6f" },
  { id: "amber", css: "#c9922f" },
  { id: "red", css: "#b3444a" },
  { id: "purple", css: "#8a6bb1" },
  { id: "teal", css: "#3d8f95" },
  { id: "charcoal", css: "#2e2e33" },
  { id: "indigo", css: "#4f5ba3" },
  { id: "navy", css: "#2f4d6b" },
  { id: "sky", css: "#4098c2" },
  { id: "forest", css: "#2f6b4a" },
  { id: "olive", css: "#7a8c3f" },
  { id: "mustard", css: "#b8923a" },
  { id: "coral", css: "#c9714f" },
  { id: "rose", css: "#b85c7e" },
  { id: "fuchsia", css: "#9c4f9c" },
  { id: "brown", css: "#8a5a3f" },
  { id: "steel", css: "#5f6b7a" },
  { id: "graphite", css: "#3a3a40" },
];

// Cores para tingir listas. Separadas das de fundo de quadro de propósito: a lista
// entra a 16% sobre a coluna, então precisa de cor viva para registrar no tema preto;
// o fundo de quadro ocupa a tela inteira e continua na família dessaturada acima.
export const LIST_COLORS = [
  { id: "slate", css: "#94a3b8" },
  { id: "blue", css: "#3b82f6" },
  { id: "green", css: "#22c55e" },
  { id: "amber", css: "#f59e0b" },
  { id: "red", css: "#ef4444" },
  { id: "purple", css: "#a855f7" },
  { id: "teal", css: "#14b8a6" },
  { id: "charcoal", css: "#52525b" },
  { id: "indigo", css: "#6366f1" },
  { id: "navy", css: "#2563eb" },
  { id: "sky", css: "#0ea5e9" },
  { id: "forest", css: "#16a34a" },
  { id: "olive", css: "#84cc16" },
  { id: "mustard", css: "#eab308" },
  { id: "coral", css: "#f97316" },
  { id: "rose", css: "#f43f5e" },
  { id: "fuchsia", css: "#d946ef" },
  { id: "brown", css: "#b45309" },
  { id: "steel", css: "#64748b" },
  { id: "graphite", css: "#71717a" },
];

// A cor da lista é gravada como hex no dado, não como id, então listas criadas antes
// desta mudança guardam o tom antigo. Este mapa converte na renderização, para elas
// clarearem junto sem precisar migrar o banco. Cor fora do mapa passa direto.
const LEGACY_TO_BRIGHT = Object.fromEntries(
  BACKGROUND_COLORS.map((c) => [c.css.toLowerCase(), LIST_COLORS.find((l) => l.id === c.id)?.css])
    .filter(([, bright]) => bright)
);

export function brightListColor(color) {
  if (!color) return color;
  return LEGACY_TO_BRIGHT[color.toLowerCase()] || color;
}

export const BACKGROUND_GRADIENTS = [
  { id: "sunset", css: "linear-gradient(135deg, #eb6834, #e34948)" },
  { id: "ocean", css: "linear-gradient(135deg, #2a78d6, #1baf7a)" },
  { id: "dusk", css: "linear-gradient(135deg, #4a3aa7, #8a6bb1)" },
  { id: "meadow", css: "linear-gradient(135deg, #0ca30c, #3d8f95)" },
  { id: "blueTones", css: "linear-gradient(135deg, #a8c8e6, #4d7ea8, #1c3a52)" },
  { id: "greenTones", css: "linear-gradient(135deg, #b7d9c2, #5a9c6f, #1f4a30)" },
  { id: "purpleTones", css: "linear-gradient(135deg, #cdbfe0, #8a6bb1, #3a2a54)" },
  { id: "amberTones", css: "linear-gradient(135deg, #f0d9a8, #c9922f, #7a541a)" },
  { id: "roseTones", css: "linear-gradient(135deg, #e8c3d1, #b85c7e, #5c2a3d)" },
  { id: "graphiteTones", css: "linear-gradient(135deg, #8a8a92, #44444c, #1c1c20)" },
];

// Gera um degradê fluindo por tonalidades (clara -> base -> escura) de uma única cor,
// misturando com branco/preto via color-mix (já usado em ListColumn.jsx para o tingimento de listas).
export function monochromaticGradient(base, angle = 135) {
  return `linear-gradient(${angle}deg, color-mix(in srgb, ${base} 55%, white), ${base}, color-mix(in srgb, ${base} 62%, black))`;
}
