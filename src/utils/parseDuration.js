// Parser do input inteligente de duração ("1h 30m", "1.5", "90m", "2:15") →
// minutos inteiros. Usado no cronômetro/lançamento manual do Time & Tracking.
// Retorna null quando o texto não é reconhecível, pra quem chama decidir o
// que fazer (não fabrica um valor, não assume zero).
export function parseDuration(texto) {
  const s = (texto || "").trim().toLowerCase();
  if (!s) return null;

  // "2:15" (h:mm)
  const doisPontos = s.match(/^(\d+):([0-5]\d)$/);
  if (doisPontos) return Number(doisPontos[1]) * 60 + Number(doisPontos[2]);

  // "1h30", "1h 30m", "1h", "30m", "45min" - h/m em qualquer combinação
  const horasMinutos = s.match(/^(?:(\d+(?:[.,]\d+)?)\s*h)?\s*(?:(\d+)\s*(?:m|min)?)?$/);
  if (horasMinutos && (horasMinutos[1] || horasMinutos[2])) {
    const horas = horasMinutos[1] ? parseFloat(horasMinutos[1].replace(",", ".")) : 0;
    const minutos = horasMinutos[2] ? Number(horasMinutos[2]) : 0;
    const total = Math.round(horas * 60 + minutos);
    return total > 0 ? total : null;
  }

  // "1.5" ou "1,5" puro = horas decimais
  const decimal = s.match(/^(\d+(?:[.,]\d+)?)$/);
  if (decimal) {
    const total = Math.round(parseFloat(decimal[1].replace(",", ".")) * 60);
    return total > 0 ? total : null;
  }

  return null;
}

// Inverso, pra mostrar de volta no input/célula: 90 -> "1h 30m", 45 -> "45m".
export function formatDuration(minutos) {
  if (!minutos || minutos <= 0) return "";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
