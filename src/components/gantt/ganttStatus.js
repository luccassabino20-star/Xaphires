// Cor fixa por status, no mesmo espírito de LABEL_COLORS (src/utils/labels.js):
// cor de conteúdo, não de tema, então não usa var(--accent) etc. - precisa
// parecer igual no claro e no escuro. "late" e "agency" existem no exemplo do
// Tom's Planner como conceitos distintos: atrasado é uma bandeira (a barra
// mantém a cor do status real e ganha um ícone de alerta), "advertising
// agency" é dono/categoria da tarefa, não progresso - por isso tem cor própria.
export const GANTT_STATUS = {
  done: { labelKey: "gantt.status.done", color: "#22c55e" },
  inProgress: { labelKey: "gantt.status.inProgress", color: "#3b82f6" },
  todo: { labelKey: "gantt.status.todo", color: "#3b82f6" },
  agency: { labelKey: "gantt.status.agency", color: "#f59e0b" },
  notStarted: { labelKey: null, color: null },
};

export const GANTT_LATE_COLOR = "#ef4444";
