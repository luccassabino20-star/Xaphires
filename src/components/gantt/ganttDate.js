// Datas civis "YYYY-MM-DD", em horário local - mesmo formato usado no resto do
// app (ver seção de recorrência no CLAUDE.md), para não gerar "Invalid Date"
// nem deslocar um dia por causa de fuso.
const MS_DAY = 86400000;

export function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function isoAddDays(iso, n) {
  return toISO(addDays(parseISO(iso), n));
}

export function diffDays(a, b) {
  return Math.round((b - a) / MS_DAY);
}

export function today0() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Uma coluna por dia entre start e end (inclusive), para desenhar o cabeçalho e
// posicionar as barras por índice de coluna em vez de escala contínua - mais
// simples de casar com o snap de dia inteiro do drag/resize.
export function buildDayColumns(rangeStart, rangeEnd) {
  const total = diffDays(rangeStart, rangeEnd) + 1;
  const days = [];
  for (let i = 0; i < total; i++) days.push(addDays(rangeStart, i));
  return days;
}

// Agrupa os dias em faixas contíguas de mesmo ano/mês, para as duas primeiras
// linhas do cabeçalho (2017 / January 2017 / February 2017...), cada uma como
// um único bloco que ocupa a largura de todos os dias que contém.
export function groupHeaderRuns(days, tag, unit) {
  const runs = [];
  days.forEach((day) => {
    const key = unit === "year" ? day.getFullYear() : `${day.getFullYear()}-${day.getMonth()}`;
    const last = runs[runs.length - 1];
    if (last && last.key === key) {
      last.span += 1;
    } else {
      const label =
        unit === "year"
          ? new Intl.DateTimeFormat(tag, { year: "numeric" }).format(day)
          : new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" }).format(day);
      runs.push({ key, label, span: 1 });
    }
  });
  return runs;
}
