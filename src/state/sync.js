import * as api from "./api.js";

function logError(e) {
  console.error("Falha ao sincronizar com o servidor:", e);
}

export function syncAction(action, state) {
  switch (action.type) {
    case "ADD_BOARD":
      api.createBoard({ id: action.id, title: action.title, visibility: action.visibility }).catch(logError);
      break;
    case "RENAME_BOARD":
      api.renameBoard(action.boardId, action.title).catch(logError);
      break;
    case "SET_BOARD_BACKGROUND":
      api.setBoardBackground(action.boardId, action.background).catch(logError);
      break;
    case "SET_AUTO_ARCHIVE_DAYS":
      api.setAutoArchiveDays(action.boardId, action.days).catch(logError);
      break;
    case "DELETE_BOARD":
      api.deleteBoard(action.boardId).catch(logError);
      break;
    case "CLEAR_BOARD":
      api.clearBoard(action.boardId).catch(logError);
      break;
    case "ADD_LIST":
      api.createList(action.boardId, { id: action.id, title: action.title }).catch(logError);
      break;
    case "RENAME_LIST":
      api.renameList(action.listId, action.title).catch(logError);
      break;
    case "SET_LIST_COLOR":
      api.setListColor(action.listId, action.color).catch(logError);
      break;
    case "SET_LIST_STUCK_HOURS":
      api.setListStuckHours(action.listId, action.hours).catch(logError);
      break;
    case "DELETE_LIST":
      api.deleteList(action.listId).catch(logError);
      break;
    case "REORDER_LISTS":
      api.setListOrder(action.boardId, action.orderedListIds).catch(logError);
      break;
    case "CLEAR_LIST_CARDS":
      api.clearListCards(action.listId).catch(logError);
      break;
    case "SORT_LIST_CARDS": {
      const board = state.boards.find((b) => b.id === action.boardId);
      const list = board?.lists.find((l) => l.id === action.listId);
      if (list) api.setCardOrder(action.listId, list.cardIds).catch(logError);
      break;
    }
    case "ADD_CARD":
      api.createCard(action.listId, { id: action.id, title: action.title }).catch(logError);
      break;
    case "DELETE_CARD":
      api.deleteCard(action.cardId).catch(logError);
      break;
    case "ARCHIVE_CARD":
      api.archiveCard(action.cardId).catch(logError);
      break;
    case "DUPLICATE_CARD": {
      const board = state.boards.find((b) => b.id === action.boardId);
      const card = board?.cards[action.newId];
      const list = board?.lists.find((l) => l.cardIds.includes(action.newId));
      if (card && list) {
        api
          .createCard(list.id, { id: action.newId, title: card.title })
          .then(() =>
            api.updateCard(action.newId, {
              title: card.title,
              description: card.description,
              labels: card.labels,
              due: card.due,
              startDate: card.startDate,
              location: card.location,
              checklist: card.checklist,
              subtasks: card.subtasks,
              memberIds: card.memberIds,
              completed: card.completed,
              urgent: card.urgent,
              important: card.important,
            })
          )
          // O servidor sempre cria no fim da lista; a cópia entra logo após o
          // original no estado local (ver reducer), então a ordem precisa ser
          // reenviada - senão ela pula pro fim assim que a página recarregar.
          .then(() => api.setCardOrder(list.id, list.cardIds))
          .catch(logError);
      }
      break;
    }
    case "UNARCHIVE_CARD": {
      api.unarchiveCard(action.cardId).catch(logError);
      // O servidor guarda a position original, mas o reducer devolve o cartão ao
      // fim da coluna. Sem reenviar a ordem, ele saltaria de lugar no próximo
      // carregamento — então a ordem que está na tela vira a verdade.
      const board = state.boards.find((b) => b.id === action.boardId);
      const list = board?.lists.find((l) => l.cardIds.includes(action.cardId));
      if (list) api.setCardOrder(list.id, list.cardIds).catch(logError);
      break;
    }
    case "ARCHIVE_COMPLETED_CARDS":
      api.archiveCompletedCards(action.listId).catch(logError);
      break;
    // MOVE_CARD não sincroniza: durante um arraste ele é despachado a cada posição
    // por onde o cartão passa, e mandar um PUT em cada uma gerava dezenas de
    // requisições concorrentes num único arraste. Como fetch não garante ordem de
    // chegada, a ordem que ficava gravada podia não ser a que estava na tela.
    // Quem persiste é o COMMIT_CARD_ORDER, uma vez, no fim do arraste.
    case "COMMIT_CARD_ORDER": {
      const board = state.boards.find((b) => b.id === action.boardId);
      if (!board) break;
      for (const listId of action.listIds || []) {
        const list = board.lists.find((l) => l.id === listId);
        if (list) api.setCardOrder(listId, list.cardIds).catch(logError);
      }
      break;
    }
    // Tem case próprio (não entra no bloco genérico abaixo) porque concluir
    // pode ter movido o cartão de lista (ver reducer) - o servidor só aprende
    // list_id/position novos via setCardOrder, e sem reenviar a lista onde o
    // cartão está agora, ele voltaria pra coluna antiga no próximo carregamento.
    case "TOGGLE_CARD_COMPLETED": {
      const board = state.boards.find((b) => b.id === action.boardId);
      const card = board?.cards[action.cardId];
      if (card) {
        api
          .updateCard(action.cardId, {
            title: card.title,
            description: card.description,
            labels: card.labels,
            due: card.due,
            startDate: card.startDate,
            location: card.location,
            checklist: card.checklist,
            subtasks: card.subtasks,
            memberIds: card.memberIds,
            completed: card.completed,
            urgent: card.urgent,
            important: card.important,
          })
          .catch(logError);
      }
      const list = board?.lists.find((l) => l.cardIds.includes(action.cardId));
      if (list) api.setCardOrder(list.id, list.cardIds).catch(logError);
      break;
    }
    case "UPDATE_CARD":
    case "TOGGLE_CARD_LABEL":
    case "TOGGLE_CARD_MEMBER":
    case "ADD_CHECKLIST_ITEM":
    case "TOGGLE_CHECKLIST_ITEM":
    case "REMOVE_CHECKLIST_ITEM":
    case "ADD_SUBTASK":
    case "TOGGLE_SUBTASK":
    case "UPDATE_SUBTASK":
    case "REMOVE_SUBTASK": {
      const board = state.boards.find((b) => b.id === action.boardId);
      const card = board?.cards[action.cardId];
      if (card) {
        api
          .updateCard(action.cardId, {
            title: card.title,
            description: card.description,
            labels: card.labels,
            due: card.due,
            startDate: card.startDate,
            location: card.location,
            checklist: card.checklist,
            subtasks: card.subtasks,
            memberIds: card.memberIds,
            completed: card.completed,
            urgent: card.urgent,
            important: card.important,
          })
          .catch(logError);
      }
      break;
    }
    case "SET_CARD_ATTACHMENTS":
      // already persisted server-side by the dedicated attachment endpoints
      break;
    default:
      break;
  }
}
