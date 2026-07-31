import { useMemo } from "react";
import GanttChart from "../gantt/GanttChart.jsx";
import { toISO } from "../gantt/ganttDate.js";

// Ponte entre dado real (atas + itens de ação) e o componente genérico em
// src/components/gantt - ele não sabe o que é uma "ata", só recebe
// groups/tasks já no formato dele. Um grupo por ata, uma linha por item de
// ação (com ou sem prazo - sem prazo vira linha em branco, mesmo padrão do
// exemplo Tom's Planner pra tarefa ainda não agendada). A barra vai da data da
// ata até o prazo, igual a versão anterior deste arquivo.
function buildGroups(minutes) {
  const todayISO = toISO(new Date());
  return minutes
    .filter((m) => (m.actionItems || []).length > 0)
    .map((m) => ({
      id: m.id,
      title: m.title,
      tasks: (m.actionItems || []).map((item) => {
        const hasDue = !!item.dueDate;
        const late = !item.done && hasDue && item.dueDate < todayISO;
        const status = item.done ? "done" : hasDue ? "todo" : "notStarted";
        const start = hasDue ? (m.date < item.dueDate ? m.date : item.dueDate) : undefined;
        const end = hasDue ? (m.date < item.dueDate ? item.dueDate : m.date) : undefined;
        return { id: item.id, title: item.text, status, late, start, end, minuteId: m.id };
      }),
    }));
}

export default function MinutesGanttView({ minutes }) {
  const groups = useMemo(() => buildGroups(minutes), [minutes]);
  return (
    // Sem onTaskClick de propósito: o Gantt é a visualização, não um atalho
    // pra abrir a ata - clicar na barra mostra o "peek" interno do próprio
    // GanttChart (título + datas), não o modal de edição.
    <GanttChart groups={groups} meta={null} legendStatusKeys={["todo", "done", "late"]} legendIconKeys={[]} />
  );
}
