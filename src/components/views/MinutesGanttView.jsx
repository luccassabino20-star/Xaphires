import { useMemo } from "react";
import GanttChart from "../gantt/GanttChart.jsx";
import { toISO } from "../gantt/ganttDate.js";
import { useMinutes } from "../../state/MinutesContext.jsx";

// Ponte entre dado real (atas + itens de ação) e o componente genérico em
// src/components/gantt - ele não sabe o que é uma "ata", só recebe
// groups/tasks já no formato dele. Um grupo por ata, uma linha por item de
// ação (com ou sem prazo - sem prazo vira linha em branco, mesmo padrão do
// exemplo Tom's Planner pra tarefa ainda não agendada). A barra vai da data da
// ata até o prazo, igual a versão anterior deste arquivo.
//
// dueSide marca qual ponta da barra é o prazo de verdade (a outra é a data da
// ata, fixa - não existe campo para editá-la). Normalmente é "end" (prazo
// depois da reunião), mas uma ata com prazo lançado antes dela mesma - incomum,
// mas o formulário não impede - inverte quem fica em cada ponta. Sem isso,
// salvar depois de arrastar gravaria a data da ata por cima do prazo.
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
        const dueSide = hasDue && m.date < item.dueDate ? "end" : "start";
        const start = hasDue ? (m.date < item.dueDate ? m.date : item.dueDate) : undefined;
        const end = hasDue ? (m.date < item.dueDate ? item.dueDate : m.date) : undefined;
        return { id: item.id, title: item.text, status, late, start, end, minuteId: m.id, dueSide };
      }),
    }));
}

export default function MinutesGanttView({ onNewMinute, onOpenMinute }) {
  const { minutes, updateMinute } = useMinutes();
  const groups = useMemo(() => buildGroups(minutes), [minutes]);

  // Arrastar uma barra só muda o prazo (dueSide) - a data da ata em si não tem
  // como ser editada por aqui, então uma tarefa arrastada pela ponta que
  // corresponde à data da ata simplesmente não gera mudança nenhuma pra salvar.
  // Agrupa por ata porque a rota PATCH /minutes/:id substitui o array
  // actionItems inteiro (ver server/routes/minutes.js) - duas tarefas
  // arrastadas na mesma ata viram uma chamada só, não duas competindo.
  async function handleSave(dirtyTasks) {
    const porAta = new Map();
    dirtyTasks.forEach((task) => {
      if (!porAta.has(task.minuteId)) porAta.set(task.minuteId, []);
      porAta.get(task.minuteId).push(task);
    });
    for (const [minuteId, tasks] of porAta) {
      const ata = minutes.find((m) => m.id === minuteId);
      if (!ata) continue;
      const novoDueDate = new Map(tasks.map((t) => [t.id, t.dueSide === "start" ? t.start : t.end]));
      const actionItems = (ata.actionItems || []).map((item) =>
        novoDueDate.has(item.id) ? { ...item, dueDate: novoDueDate.get(item.id) } : item
      );
      await updateMinute(minuteId, { actionItems });
    }
  }

  return (
    // Sem onTaskClick de propósito: o Gantt é a visualização, não um atalho
    // pra abrir a ata direto no clique - clicar na barra mostra o "peek"
    // interno do próprio GanttChart (título + datas), e "Abrir" na barra de
    // ferramentas usa essa seleção pra abrir o modal de edição de verdade.
    <GanttChart
      groups={groups}
      meta={null}
      legendStatusKeys={["todo", "done", "late"]}
      legendIconKeys={[]}
      onSave={handleSave}
      onNew={onNewMinute}
      onOpenSelected={(task) => onOpenMinute?.(task.minuteId)}
    />
  );
}
