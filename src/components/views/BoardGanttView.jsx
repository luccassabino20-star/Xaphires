import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch } from "../../state/BoardContext.jsx";
import { flattenCards } from "../../utils/boardCards.js";
import { uid } from "../../utils/id.js";
import GanttChart from "../gantt/GanttChart.jsx";
import { toISO, today0, isoAddDays } from "../gantt/ganttDate.js";

// Ponte entre cartão real e o componente genérico em src/components/gantt -
// cartão já tem os dois lados da barra como campos próprios e editáveis
// (startDate e due), então arrastar qualquer ponta grava direto no campo
// correspondente, sem "data fixa" no meio do caminho para proteger.
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
  const { t } = useTranslation();
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

  // Cartão pertence a uma lista, e o botão "Novo" da barra de ferramentas não
  // sabe de qual - cai sempre na primeira do quadro (igual à ordem que a
  // barra lateral do quadro mostra); mover pra outra depois é o "Mover para
  // lista" que o CardModal já tem. Nasce com hoje→amanhã pra aparecer como
  // barra na hora, em vez de sumir da timeline por não ter data nenhuma (ver
  // filtro startDate||due em buildGroups) - e abre direto no cartão de
  // verdade pra dar título, porque não existe um segundo formulário de
  // criação só pra esta view.
  function handleNew() {
    const list = board.lists[0];
    if (!list) return;
    const id = uid();
    const start = toISO(today0());
    const due = isoAddDays(start, 1);
    dispatch({ type: "ADD_CARD", boardId: board.id, listId: list.id, id, title: t("gantt.newTaskDefaultTitle") });
    dispatch({ type: "UPDATE_CARD", boardId: board.id, cardId: id, patch: { startDate: start, due } });
    onOpenCard?.(id, "title");
  }

  return (
    // onTaskClick abre o cartão de verdade direto no clique (barra ou linha
    // da árvore) - é ali que dá pra pôr responsável e escrever observação
    // (descrição), não só ver título/data no "peek" interno do GanttChart.
    // Sem seleção prévia, o botão "Abrir" da barra de ferramentas não tem
    // mais função aqui - GanttChart o esconde sozinho quando onTaskClick
    // está definido.
    <GanttChart
      groups={groups}
      meta={null}
      legendStatusKeys={["todo", "done", "late"]}
      legendIconKeys={[]}
      onSave={readOnly ? undefined : handleSave}
      onNew={readOnly ? undefined : handleNew}
      onTaskClick={(task) => onOpenCard?.(task.id)}
      readOnly={readOnly}
    />
  );
}
