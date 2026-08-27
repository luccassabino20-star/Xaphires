// Curado (8, não mais 20+) - a lista antiga cobria a roda de cores inteira e
// lia como um seletor de tinta, não uma paleta de marca. Cada tom aqui tem um
// motivo de existir (ver o pedido de redesign do popover de personalização).
export const BACKGROUND_COLORS = [
  { id: "xaphiresPurple", css: "#6D28D9" },
  { id: "darkBlue", css: "#0F172A" },
  { id: "graphite", css: "#1E293B" },
  { id: "emerald", css: "#059669" },
  { id: "softRose", css: "#D48CA6" },
  { id: "offWhite", css: "#F4F1EA" },
  { id: "petrol", css: "#0E7490" },
  { id: "wine", css: "#7F1D4B" },
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

// Cinco degradês premium nomeados, cada um com 3 paradas (a terceira tonalidade
// evita o "poster liso" de um gradiente de 2 cores) - substituem os ~10
// genéricos de antes, que se sobrepunham em intenção (várias variações do
// mesmo par de cores) sem nenhum ler como acabamento de produto.
export const BACKGROUND_GRADIENTS = [
  { id: "sunsetPremium", css: "linear-gradient(135deg, #fb923c, #ec4899, #7c3aed)" },
  { id: "auroraBorealis", css: "linear-gradient(135deg, #2dd4bf, #38bdf8, #6366f1)" },
  { id: "midnightLuxury", css: "linear-gradient(145deg, #1e1b4b, #312e81, #020617)" },
  { id: "cosmicPurple", css: "linear-gradient(135deg, #7c3aed, #a855f7, #d946ef)" },
  { id: "cyberpunkNeon", css: "linear-gradient(120deg, #ff2d95, #a020f0, #00c8ff)" },
];

// Escurece uma camada de fundo com imagem/padrão rico para o texto e os cards
// continuarem legíveis por cima (pedido de personalização do quadro, item
// "ajuste de overlay para leitura") - um scrim escuro semi-transparente como
// primeira camada do `background`, empilhado antes da imagem/padrão real.
// Camadas de `background` em CSS pintam na ordem declarada (a primeira fica
// por cima), então isto não precisa de elemento/pseudo-elemento à parte.
export function withOverlay(css) {
  return `linear-gradient(rgba(12,12,16,0.32), rgba(12,12,16,0.32)), ${css}`;
}

// "Papéis de parede" em CSS puro (gradientes/formas), não fotos de verdade -
// decisão tomada com o cliente: as fotos reais (paisagem, retrato, o que for)
// ficam por conta do botão de upload logo abaixo, específicas de cada empresa;
// não existe uma imagem de estoque "certa" para todo mundo, e hotlinkar um
// serviço externo (Unsplash etc.) criaria dependência de rede e questão de
// licença num produto pago. Cada entrada já sai com o overlay aplicado.
export const BACKGROUND_WALLPAPERS = [
  {
    id: "nature",
    label: "Natureza",
    css: withOverlay(
      "radial-gradient(circle at 20% 25%, #86efac 0%, transparent 45%), radial-gradient(circle at 80% 70%, #16a34a 0%, transparent 50%), linear-gradient(160deg, #d9f99d, #4d7c0f 60%, #14532d)"
    ),
  },
  {
    id: "minimalArchitecture",
    label: "Arquitetura Minimalista",
    css: withOverlay(
      "repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 42px), linear-gradient(135deg, #e5e7eb, #6b7280 55%, #1f2937)"
    ),
  },
  {
    id: "softTexture",
    label: "Textura Macia",
    css: withOverlay(
      "radial-gradient(circle at 25% 25%, #fbcfe8 0%, transparent 50%), radial-gradient(circle at 75% 75%, #ddd6fe 0%, transparent 50%), linear-gradient(135deg, #fdf2f8, #ede9fe)"
    ),
  },
  {
    id: "galaxy",
    label: "Espaço / Galáxia",
    css: withOverlay(
      "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.9) 0 1px, transparent 1px), radial-gradient(circle at 65% 40%, rgba(255,255,255,0.7) 0 1px, transparent 1px), radial-gradient(circle at 40% 82%, rgba(255,255,255,0.6) 0 1px, transparent 1px), radial-gradient(circle at 85% 15%, rgba(255,255,255,0.8) 0 1px, transparent 1px), radial-gradient(circle at 50% 50%, #7c3aed 0%, transparent 55%), radial-gradient(circle at 20% 72%, #4338ca 0%, transparent 50%), linear-gradient(160deg, #0f0c29, #302b63, #0f172a)"
    ),
  },
  {
    id: "abstract3d",
    label: "Abstrato 3D",
    css: withOverlay(
      "radial-gradient(circle at 20% 30%, #f472b6 0%, transparent 45%), radial-gradient(circle at 75% 25%, #60a5fa 0%, transparent 45%), radial-gradient(circle at 30% 80%, #fbbf24 0%, transparent 45%), radial-gradient(circle at 80% 75%, #34d399 0%, transparent 45%), linear-gradient(135deg, #1e1b4b, #0f172a)"
    ),
  },
  {
    id: "darkMinimal",
    label: "Minimalista Escuro",
    css: withOverlay("radial-gradient(circle at 70% 30%, rgba(255,255,255,0.06) 0%, transparent 60%), linear-gradient(160deg, #111113, #000000)"),
  },
];

// Gera um degradê fluindo por tonalidades (clara -> base -> escura) de uma única cor,
// misturando com branco/preto via color-mix (já usado em ListColumn.jsx para o tingimento de listas).
export function monochromaticGradient(base, angle = 135) {
  return `linear-gradient(${angle}deg, color-mix(in srgb, ${base} 55%, white), ${base}, color-mix(in srgb, ${base} 62%, black))`;
}
