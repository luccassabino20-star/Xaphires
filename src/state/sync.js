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
    case "MOVE_CARD": {
      const board = state.boards.find((b) => b.id === action.boardId);
      const toList = board?.lists.find((l) => l.id === action.toListId);
      const fromList = board?.lists.find((l) => l.id === action.fromListId);
      if (toList) api.setCardOrder(action.toListId, toList.cardIds).catch(logError);
      if (fromList && fromList.id !== toList?.id) api.setCardOrder(action.fromListId, fromList.cardIds).catch(logError);
      break;
    }
    case "UPDATE_CARD":
    case "TOGGLE_CARD_COMPLETED":
    case "TOGGLE_CARD_LABEL":
    case "TOGGLE_CARD_MEMBER":
    case "ADD_CHECKLIST_ITEM":
    case "TOGGLE_CHECKLIST_ITEM":
    case "REMOVE_CHECKLIST_ITEM": {
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
