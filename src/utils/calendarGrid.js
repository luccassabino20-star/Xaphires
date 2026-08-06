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

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// Datas em que uma rotina automática (server/recurrence.js) dispararia dentro
// de [rangeStart, rangeEnd], inclusive nos dois extremos. Mesma aritmética de
// calendário do servidor (dia de mês limitado ao tamanho do mês, por exemplo),
// mas reescrita aqui porque o cliente não importa server/recurrence.js - são
// bundles separados, e este arquivo já é o lugar de contas de calendário do
// cliente. Só serve para PREVER ocorrências futuras no CalendarView antes do
// cartão nascer de verdade; a fonte da verdade sobre o que já rodou continua
// sendo lastRunAt, no servidor.
export function occurrencesInRange(rule, rangeStart, rangeEnd) {
  if (!rule.active) return [];
  const out = [];

  if (rule.freq === "daily") {
    const d = new Date(rangeStart);
    d.setHours(0, 0, 0, 0);
    while (d <= rangeEnd) {
      out.push(toISODate(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  if (rule.freq === "weekly") {
    if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) return out;
    const d = new Date(rangeStart);
    d.setHours(0, 0, 0, 0);
    while (d.getDay() !== rule.weekday) d.setDate(d.getDate() + 1);
    while (d <= rangeEnd) {
      out.push(toISODate(d));
      d.setDate(d.getDate() + 7);
    }
    return out;
  }

  if (rule.freq === "monthly") {
    // monthday2 é opcional (ver server/recurrence.js) - filtra fora quando
    // ausente, em vez de tratar como 0.
    const dias = [rule.monthday, rule.monthday2].filter((d) => Number.isInteger(d) && d >= 1 && d <= 31);
    let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    const fimBusca = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);
    while (cursor <= fimBusca) {
      for (const dia of dias) {
        const diaLimitado = Math.min(dia, lastDayOfMonth(cursor.getFullYear(), cursor.getMonth()));
        const ocorrencia = new Date(cursor.getFullYear(), cursor.getMonth(), diaLimitado);
        if (ocorrencia >= rangeStart && ocorrencia <= rangeEnd) out.push(toISODate(ocorrencia));
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return out;
  }

  return out;
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
