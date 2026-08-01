import { useMemo } from "react";
import { useBoardDispatch } from "../../state/BoardContext.jsx";
import { flattenCards } from "../../utils/boardCards.js";
import GanttChart from "../gantt/GanttChart.jsx";
import { toISO } from "../gantt/ganttDate.js";

// Ponte entre cartão real e o componente genérico em src/components/gantt -
// mesmo padrão de MinutesGanttView, mas mais simples: cartão já tem os dois
// lados da barra como campos próprios e editáveis (startDate e due), então
// arrastar qualquer ponta grava direto no campo correspondente - diferente da
// ata, não existe uma "data fixa" no meio do caminho para proteger.
//
// Um grupo por lista, uma barra por cartão com pelo menos uma das duas datas -
// mesmo filtro que a Linha do Tempo usava (`c.startDate || c.due`), no lugar
// que ela ocupava no ViewSwitcher.
function buildGroups(board, searchQuery, memberFilter) {
  const cards = flattenCards(board).filter((c) => {
    const matchesSearch = !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMember = !memberFilter || (c.memberIds || []).includes(memberFilter);
    return matchesSearch && matchesMember && (c.startDate || c.due);
  });
  const todayISO = toISO(new Date());
  return board.lists
    .map((list) => ({
      id: list.id,
      title: list.title,
      tasks: cards
        .filter((c) => c.listId === list.id)
        .map((c) => {
          const start = c.startDate || c.due;
          const end = c.due || c.startDate;
          const late = !c.completed && !!c.due && c.due < todayISO;
          return { id: c.id, title: c.title, status: c.completed ? "done" : "todo", late, start, end };
        }),
    }))
    .filter((g) => g.tasks.length > 0);
}

export default function BoardGanttView({ board, searchQuery, memberFilter, onOpenCard }) {
  const dispatch = useBoardDispatch();
  const readOnly = board.myRole === "viewer";
  const groups = useMemo(() => buildGroups(board, searchQuery, memberFilter), [board, searchQuery, memberFilter]);

  function handleSave(dirtyTasks) {
    dirtyTasks.forEach((task) => {
      dispatch({
        type: "UPDATE_CARD",
        boardId: board.id,
        cardId: task.id,
        patch: { startDate: task.start || null, due: task.end || null },
      });
    });
  }

  return (
    // Sem onTaskClick: clicar na barra mostra o peek (título + datas), e
    // "Abrir" na barra de ferramentas usa essa seleção pra abrir o cartão de
    // verdade - mesmo motivo de MinutesGanttView. "Novo" fica sem handler de
    // propósito: cartão pertence a uma lista, não existe "cartão novo" solto
    // pra este atalho criar - quem quiser cria pela lista, como sempre.
    <GanttChart
      groups={groups}
      meta={null}
      legendStatusKeys={["todo", "done", "late"]}
      legendIconKeys={[]}
      onSave={readOnly ? undefined : handleSave}
      onOpenSelected={(task) => onOpenCard?.(task.id)}
      readOnly={readOnly}
    />
  );
}
