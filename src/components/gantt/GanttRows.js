// Achata grupos -> tarefas -> subtarefas numa lista única de linhas, na mesma
// ordem para a coluna da esquerda (Activity/Status) e para a timeline - as duas
// só ficam alinhadas linha a linha se usarem exatamente esta função.
export function buildGanttRows(groups, collapsedIds) {
  const rows = [];
  groups.forEach((group) => {
    const collapsed = collapsedIds.has(group.id);
    rows.push({ type: "group", id: group.id, title: group.title, collapsed, key: "g-" + group.id });
    if (collapsed) return;
    group.tasks.forEach((task) => {
      rows.push({ type: "task", id: task.id, task, depth: 0, key: task.id });
      (task.children || []).forEach((child) => {
        rows.push({ type: "task", id: child.id, task: child, depth: 1, key: child.id });
      });
    });
  });
  return rows;
}
