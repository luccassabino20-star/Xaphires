// Luminância relativa (WCAG) a partir de um hex #rgb/#rrggbb - decide se o texto
// por cima de uma cor de fundo escolhida livremente (ver SidebarStyleMenu em
// Sidebar.jsx) deve virar claro ou continuar escuro.
function relativeLuminance(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num) || full.length !== 6) return 1; // hex inválido: trata como claro (texto escuro), o mais seguro por padrão
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

// Primeira cor hex encontrada numa string CSS qualquer (gradiente, ou cor sólida) -
// aproximação para decidir contraste de um `board.background` arbitrário: não dá
// para calcular a luminância "certa" de um gradiente com várias paradas, então o
// primeiro tom já serve de indicativo (gradientes deste app são todos claro->escuro
// ou tons próximos, ver BACKGROUND_GRADIENTS em utils/backgrounds.js).
function firstHexIn(css) {
  const m = /#[0-9a-fA-F]{3,6}/.exec(css || "");
  return m ? m[0] : null;
}

// true quando o fundo é escuro o bastante para pedir texto claro por cima.
export function isDarkBackground(css) {
  if (!css) return false;
  const hex = firstHexIn(css);
  if (!hex) return false; // color-mix()/rgb()/nome de cor: sem hex extraível, assume claro (mais comum nos presets)
  return relativeLuminance(hex) < 0.5;
}
