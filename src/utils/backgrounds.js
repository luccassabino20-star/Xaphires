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
