// Data civil "YYYY-MM-DD" em horário local, mesmo formato que o resto do app usa
// pra due/startDate (ver seção de recorrência no CLAUDE.md) - sem passar por
// UTC, senão o dia muda sozinho pra quem está a oeste de Greenwich.
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
export function today0() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Abreviação de dia da semana pedida especificamente pro pt-BR (do/2ª/3ª.../sá,
// como no ClickUp em português) - fora do pt, usa o Intl.DateTimeFormat padrão
// do navegador pra soar nativo no idioma de quem está usando.
const PT_WEEKDAYS = ["do", "2ª", "3ª", "4ª", "5ª", "6ª", "sá"];
export function weekdayLabels(lang, tag) {
  if (lang === "pt") return PT_WEEKDAYS;
  const base = new Date(2023, 0, 1); // um domingo, ponto de partida estável
  const fmt = new Intl.DateTimeFormat(tag, { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(addDays(base, i)).replace(".", ""));
}

// Próximo sábado estritamente depois de hoje - se hoje já é sábado ou domingo,
// pula pro fim de semana seguinte (é o que "próximo" quer dizer, não "este").
export function nextWeekend(from) {
  const day = from.getDay(); // 0=domingo...6=sábado
  let delta = (6 - day + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(from, delta);
}
// Próxima segunda-feira estritamente depois de hoje.
export function nextWeek(from) {
  const day = from.getDay();
  let delta = (1 - day + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(from, delta);
}

// Grade de 6 semanas (42 dias) cobrindo o mês inteiro, começando no domingo da
// semana em que o dia 1 cai - dias fora do mês vêm junto (outMonth: true) só
// pra preencher a grade, igual todo datepicker de calendário.
export function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(start, i);
    return { date, inMonth: date.getMonth() === month };
  });
}
