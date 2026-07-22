const SEED_CONTENT = {
  pt: {
    boardTitle: "Meu Quadro",
    listTodo: "A Fazer",
    listDoing: "Em Andamento",
    listDone: "Concluído",
    welcomeCardTitle: "Bem-vindo ao seu quadro Kanban 👋",
    welcomeCardDescription: "Clique em um cartão para editar detalhes, etiquetas, membros, datas e checklists.",
    dragCardTitle: "Arraste os cartões entre as listas",
    inviteCardTitle: "Convide sua equipe no painel de Usuários",
  },
  en: {
    boardTitle: "My Board",
    listTodo: "To Do",
    listDoing: "In Progress",
    listDone: "Done",
    welcomeCardTitle: "Welcome to your Kanban board 👋",
    welcomeCardDescription: "Click a card to edit details, labels, members, dates and checklists.",
    dragCardTitle: "Drag cards between lists",
    inviteCardTitle: "Invite your team in the Users panel",
  },
  es: {
    boardTitle: "Mi Tablero",
    listTodo: "Por Hacer",
    listDoing: "En Progreso",
    listDone: "Completado",
    welcomeCardTitle: "Bienvenido a tu tablero Kanban 👋",
    welcomeCardDescription: "Haz clic en una tarjeta para editar detalles, etiquetas, miembros, fechas y listas de tareas.",
    dragCardTitle: "Arrastra las tarjetas entre las listas",
    inviteCardTitle: "Invita a tu equipo en el panel de Usuarios",
  },
};

export function getSeedContent(locale) {
  return SEED_CONTENT[locale] || SEED_CONTENT.pt;
}
