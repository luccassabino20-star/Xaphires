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
  // +5 pastel/luxo pedidos depois. "Azul Cerúleo Profundo" não usa o #1E293B
  // do pedido - é o mesmo hex de "graphite" logo acima, e um swatch idêntico
  // a outro já existente fica com dois botões "ativos" ao mesmo tempo (o
  // destaque casa por cor, não por id). Troquei por um cerúleo genuinamente
  // diferente, mesma intenção.
  { id: "champagneBlush", css: "#F4EAE6" },
  { id: "sageMint", css: "#E2EFCB" },
  { id: "roseGoldNude", css: "#E8C5C8" },
  { id: "ceruleanDeep", css: "#123C5C" },
  { id: "botanicalOlive", css: "#2D3A2F" },
  // +5, segundo pacote pastel/luxo. Nenhum hex bate com os 13 de cima.
  { id: "lavenderSoft", css: "#E6E6FA" },
  { id: "warmSand", css: "#F5EBE0" },
  { id: "mutedSage", css: "#D8E2DC" },
  { id: "premiumGraphite", css: "#2B2D42" },
  { id: "deepPlum", css: "#4A1525" },
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
  // +5 pedidos depois - as duas cores do pedido viram a primeira e a última
  // parada, com uma terceira no meio inserida pra seguir a regra logo acima
  // (3 paradas, não 2 - "poster liso" é exatamente o que 2 cores produzem).
  { id: "sunsetSilk", css: "linear-gradient(135deg, #ffdee9, #fff1eb, #b5fffc)" },
  { id: "champagneGlow", css: "linear-gradient(135deg, #fdfbfb, #f1e9d8, #ebedee)" },
  { id: "nordicAurora", css: "linear-gradient(135deg, #e0c3fc, #8ec5fc, #b8fce0)" },
  { id: "deepVelvet", css: "linear-gradient(145deg, #1e1035, #2d0f3d, #0f081d)" },
  { id: "emeraldLuxe", css: "linear-gradient(135deg, #065f46, #064e3b, #022c22)" },
  // +5, segundo pacote. "Rose Dust" veio do pedido com a última cor repetida
  // (hard stop em 99%/100%, não uma terceira cor) - troquei por um tom malva
  // genuíno no meio, mesma regra dos 5 anteriores. "Midnight Eclipse" já veio
  // com 3 paradas de verdade, usada como está.
  { id: "peachBlossom", css: "linear-gradient(135deg, #ffecd2, #fdd9b8, #fcb69f)" },
  { id: "luxeCashmere", css: "linear-gradient(135deg, #e3d5ca, #dcc7b8, #d5bdaf)" },
  { id: "mentaBreeze", css: "linear-gradient(135deg, #e8f5e9, #d5ecd6, #c8e6c9)" },
  { id: "midnightEclipse", css: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)" },
  { id: "roseDust", css: "linear-gradient(135deg, #f3e7e9, #e6d9e8, #e3eeff)" },
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
  // +5 pedidos depois, seguindo a mesma regra do comentário no topo do
  // array: aproximação em CSS (gradiente/padrão), nunca foto de estoque real -
  // "mármore" e "luz entre folhas" aqui são radial-gradient simulando veio e
  // luz, não uma imagem baixada de algum banco de fotos.
  {
    id: "silkWaves",
    label: "Seda Orgânica",
    css: withOverlay(
      "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.5) 0%, transparent 55%), radial-gradient(circle at 75% 65%, rgba(244,234,230,0.6) 0%, transparent 60%), linear-gradient(135deg, #fdf6f3, #f4eae6 50%, #eadfe0)"
    ),
  },
  {
    id: "marbleGold",
    label: "Mármore Gold",
    css: withOverlay(
      "repeating-linear-gradient(115deg, rgba(212,175,55,0.18) 0 2px, transparent 2px 90px), repeating-linear-gradient(25deg, rgba(212,175,55,0.10) 0 1px, transparent 1px 140px), linear-gradient(160deg, #ffffff, #f3efe9 55%, #e8e2d8)"
    ),
  },
  {
    id: "botanicalLight",
    label: "Luz Botânica",
    css: withOverlay(
      "radial-gradient(circle at 25% 20%, rgba(255,251,235,0.55) 0%, transparent 40%), radial-gradient(circle at 70% 60%, rgba(226,239,203,0.5) 0%, transparent 45%), linear-gradient(160deg, #f1efe7, #dce5c8 60%, #a8b896)"
    ),
  },
  {
    id: "frostedGlass",
    label: "Vidro Jateado",
    css: withOverlay(
      "radial-gradient(circle at 30% 30%, #d9e4f5 0%, transparent 55%), radial-gradient(circle at 70% 70%, #f5e6f0 0%, transparent 55%), radial-gradient(circle at 50% 50%, #edeff3 0%, transparent 70%), linear-gradient(135deg, #f7f8fa, #e9ecf1)"
    ),
  },
  {
    id: "darkSpaLounge",
    label: "Dark Spa Lounge",
    css: withOverlay(
      "radial-gradient(circle at 20% 80%, rgba(180,83,9,0.28) 0%, transparent 50%), radial-gradient(circle at 75% 25%, rgba(124,45,18,0.22) 0%, transparent 55%), linear-gradient(160deg, #241611, #140c09 70%, #000000)"
    ),
  },
  // +5, segundo pacote - mesma regra do topo do arquivo (CSS puro, nunca
  // foto de banco de imagens). "Luz Neon Pastel" usa cor mais saturada que
  // "Vidro Jateado" (pacote anterior) de propósito, pra não sair uma cópia
  // do mesmo efeito com nome diferente - um é vidro fosco/dessaturado, o
  // outro é luz de estúdio com mais presença de cor.
  {
    id: "softConcrete",
    label: "Concreto Minimalista",
    css: withOverlay(
      "repeating-linear-gradient(90deg, rgba(0,0,0,0.025) 0 1px, transparent 1px 60px), repeating-linear-gradient(0deg, rgba(0,0,0,0.02) 0 1px, transparent 1px 60px), linear-gradient(150deg, #e8e8e6, #d6d6d3 55%, #c4c4c0)"
    ),
  },
  {
    id: "whiteQuartzite",
    label: "Quartzito Branco",
    css: withOverlay(
      "repeating-linear-gradient(100deg, rgba(150,160,170,0.14) 0 1px, transparent 1px 110px), repeating-linear-gradient(10deg, rgba(150,160,170,0.10) 0 1px, transparent 1px 160px), linear-gradient(160deg, #ffffff, #f2f4f5 55%, #e4e8ea)"
    ),
  },
  {
    id: "softDunes",
    label: "Dunas Suaves",
    css: withOverlay(
      "radial-gradient(circle at 30% 85%, rgba(255,255,255,0.18) 0%, transparent 45%), linear-gradient(180deg, #f9c98d 0%, #f2a878 35%, #d97b56 65%, #93493f 100%)"
    ),
  },
  {
    id: "pastelNeonLight",
    label: "Luz Neon Pastel",
    css: withOverlay(
      "radial-gradient(circle at 20% 30%, #ff9ecf 0%, transparent 50%), radial-gradient(circle at 80% 70%, #7ec8ff 0%, transparent 50%), radial-gradient(circle at 50% 50%, #ffffff 0%, transparent 65%), linear-gradient(135deg, #fbe0f0, #e0f0ff)"
    ),
  },
  {
    id: "lightOak",
    label: "Madeira Clara",
    css: withOverlay(
      "repeating-linear-gradient(90deg, rgba(140,105,70,0.12) 0 2px, transparent 2px 34px, rgba(140,105,70,0.06) 34px 36px, transparent 36px 68px), linear-gradient(180deg, #e8d3b3, #dcbf99)"
    ),
  },
];

// Gera um degradê fluindo por tonalidades (clara -> base -> escura) de uma única cor,
// misturando com branco/preto via color-mix (já usado em ListColumn.jsx para o tingimento de listas).
export function monochromaticGradient(base, angle = 135) {
  return `linear-gradient(${angle}deg, color-mix(in srgb, ${base} 55%, white), ${base}, color-mix(in srgb, ${base} 62%, black))`;
}
