import { addDays, toISO } from "./ganttDate.js";

// Dados de exemplo, estrutura livre de qualquer entidade real do app (ata,
// cartão etc.) - ver a decisão de manter este Gantt desacoplado, para uso
// futuro em outro lugar do produto. As datas são relativas a hoje (não fixas
// em 2017 como no mockup original) só para a linha de "hoje" e os status
// derivados (atrasado/em andamento) terem algo para mostrar ao abrir a demo.
const anchor = addDays(new Date(new Date().setHours(0, 0, 0, 0)), -9);
function d(offset) {
  return toISO(addDays(anchor, offset));
}

export const ganttMockData = {
  meta: {
    event: "Tom's Conference",
    venue: "Hilton Hotel",
    date: d(45),
  },
  groups: [
    {
      id: "initialize",
      title: "Initialize",
      tasks: [
        { id: "t1", title: "Set objectives and goals", status: "done", start: d(0), end: d(1) },
        { id: "t2", title: "Conference committee", status: "done", start: d(1), end: d(4), icons: ["meeting"] },
        { id: "t3", title: "Appoint conference manager", status: "done", start: d(4), end: d(5) },
        { id: "t4", title: "Determine budget", status: "todo", start: d(5), end: d(6), icons: ["meeting"], late: true },
        { id: "t5", title: "Set timeline and dates", status: "done", start: d(5), end: d(8), icons: ["check"] },
        { id: "t6", title: "Choose theme", status: "done", start: d(4), end: d(5) },
      ],
    },
    {
      id: "venue",
      title: "Venue/Speakers/Sponsors",
      tasks: [
        { id: "t7", title: "Set up venue checklist", status: "done", start: d(6), end: d(7) },
        { id: "t8", title: "Research venues", status: "inProgress", start: d(6), end: d(9) },
        { id: "t9", title: "Book Venue", status: "todo", start: d(9), end: d(10), icons: ["meeting", "call"] },
        { id: "t10", title: "Preliminary list speakers", status: "notStarted" },
        { id: "t11", title: "Approach & book speakers", status: "todo", start: d(6), end: d(13) },
        { id: "t12", title: "Outline conference program", status: "todo", start: d(9), end: d(12) },
        { id: "t13", title: "Longlist sponsors", status: "todo", start: d(13), end: d(19) },
        { id: "t14", title: "Approach sponsors", status: "todo", start: d(19), end: d(24), icons: ["meeting"] },
      ],
    },
    {
      id: "communication",
      title: "Communication material",
      tasks: [
        { id: "t15", title: "Logo", status: "agency", start: d(9), end: d(10) },
        { id: "t16", title: "Website", status: "agency", start: d(9), end: d(24) },
        { id: "t17", title: "Flyer & adds", status: "agency", start: d(24), end: d(30) },
        { id: "t18", title: "Press release", status: "agency", start: d(24), end: d(27), icons: ["mail"] },
        { id: "t19", title: "Advertise", status: "agency", start: d(24), end: d(27), icons: ["meeting", "mail"] },
        { id: "t20", title: "Printed program", status: "todo", start: d(27), end: d(52) },
        { id: "t21", title: "Delegate information pack", status: "agency", start: d(24), end: d(25) },
        { id: "t22", title: "Signage", status: "notStarted" },
        { id: "t23", title: "Instructions staff/caterers", status: "notStarted" },
        { id: "t24", title: "Instructions speakers", status: "notStarted" },
      ],
    },
    {
      id: "staff",
      title: "Staff & equipment",
      tasks: [
        { id: "t25", title: "Order supplies", status: "notStarted" },
        {
          id: "t26",
          title: "Hire staff",
          status: "notStarted",
          children: [
            { id: "t26a", title: "Caterer/bartenders", status: "notStarted" },
            { id: "t27", title: "Security", status: "notStarted" },
            { id: "t28", title: "Photographer", status: "notStarted" },
            { id: "t29", title: "Cleanup Crew", status: "notStarted" },
          ],
        },
      ],
    },
  ],
};
