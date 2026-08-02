import { localeTag } from "../i18n/locale.js";

// 2021-08-02 foi uma segunda-feira: usado como âncora para gerar os nomes dos dias da semana na ordem seg->dom.
export function weekdayNames(lng) {
  const fmt = new Intl.DateTimeFormat(localeTag(lng), { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2021, 7, 2 + i)));
}

export function monthNames(lng) {
  const fmt = new Intl.DateTimeFormat(localeTag(lng), { month: "long" });
  return Array.from({ length: 12 }, (_, i) => {
    const name = fmt.format(new Date(2021, i, 1));
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildGrid(monthDate) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const leading = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - leading + 1;
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayOffset);
    cells.push({ date, inMonth: date.getMonth() === monthDate.getMonth() });
  }
  return cells;
}
