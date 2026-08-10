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

// Mesmo achatamento de buildGanttRows, mas sem grupo/collapse - para quem
// precisa da lista de tarefas em si (salvar o que foi arrastado, exportar CSV),
// não da lista de linhas para desenhar.
export function flattenTasks(groups) {
  const tasks = [];
  groups.forEach((group) => {
    group.tasks.forEach((task) => {
      tasks.push(task);
      (task.children || []).forEach((child) => tasks.push(child));
    });
  });
  return tasks;
}
