import { toISODate } from "./calendarGrid.js";

// Helpers de hora do dia para a grade semanal do Planejador - mesma técnica
// (slot fixo de 15min, algoritmo de "raias" pra sobreposição) já provada em
// src/modules/saude-clinicas/agendaUtils.js, portada aqui sem o que é
// específico de agendamento de clínica (paciente/profissional). Janela mais
// larga que a da clínica (6h-22h em vez de 7h-20h) porque é agenda pessoal,
// não horário comercial.
export const HORA_INICIO = 6 * 60; // minutos desde 00:00
export const HORA_FIM = 22 * 60;
export const PASSO_MIN = 15;
export const TOTAL_SLOTS = (HORA_FIM - HORA_INICIO) / PASSO_MIN;
export const SLOT_ALTURA = 22; // px

export function paraMinutos(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function minutosParaHora(min) {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}
export function slotDoHorario(hhmm) {
  return Math.max(0, Math.round((paraMinutos(hhmm) - HORA_INICIO) / PASSO_MIN));
}

// Segunda-feira da semana que contém a data - mesma convenção de semana do
// buildGrid em calendarGrid.js (segunda como primeiro dia).
export function segundaDaSemana(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diaSemana = d.getDay(); // 0 = domingo
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + offset);
  return d;
}
// Os 7 Date da semana que contém `anchorDate`, segunda a domingo.
export function weekDays(anchorDate) {
  const segunda = segundaDaSemana(anchorDate);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda);
    d.setDate(d.getDate() + i);
    return d;
  });
}
export { toISODate };

// Atribui uma "raia" (coluna dentro do dia) a cada item com horário
// sobreposto, pra não desenhar um bloco em cima do outro - mesmo algoritmo de
// agendaUtils.js. items precisa ter {id, inicioMin, fimMin}; devolve
// Map(id -> {raia, totalRaias}).
export function calcularRaias(items) {
  const ordenados = [...items].sort((a, b) => a.inicioMin - b.inicioMin || a.fimMin - b.fimMin);
  const finalDaRaia = [];
  const raiaDoItem = new Map();
  for (const it of ordenados) {
    let raia = finalDaRaia.findIndex((fim) => fim <= it.inicioMin);
    if (raia === -1) {
      raia = finalDaRaia.length;
      finalDaRaia.push(it.fimMin);
    } else {
      finalDaRaia[raia] = it.fimMin;
    }
    raiaDoItem.set(it.id, raia);
  }
  const totalRaias = Math.max(1, finalDaRaia.length);
  const resultado = new Map();
  for (const it of ordenados) resultado.set(it.id, { raia: raiaDoItem.get(it.id), totalRaias });
  return resultado;
}
