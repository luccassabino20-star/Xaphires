import { isCompletionColumnTitle } from "../utils/columnCompletion.js";

function updateBoard(state, boardId, updater) {
  return { ...state, boards: state.boards.map((b) => (b.id === boardId ? updater(b) : b)) };
}

export function reducer(state, action) {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, boards: action.boards, hydrated: true };

    // ---------- Boards ----------
    case "ADD_BOARD":
      return {
        ...state,
        boards: [
          ...state.boards,
          {
            id: action.id,
            title: action.title,
            background: null,
            ownerId: action.ownerId,
            visibility: action.visibility === "private" ? "private" : "shared",
            lists: [],
            cards: {},
            // Quem cria é sempre o dono - sem isto o quadro nasce com myRole
            // indefinido, e Sidebar.jsx o classifica como "Compartilhado
            // comigo" (myRole !== "owner") até o próximo refetch, escondendo
            // o botão de excluir (que também exige myRole === "owner").
            myRole: "owner",
            sharedWith: [],
          },
        ],
      };
    case "RENAME_BOARD":
      return { ...state, boards: state.boards.map((b) => (b.id === action.boardId ? { ...b, title: action.title } : b)) };
    case "SET_AUTO_ARCHIVE_DAYS":
      return {
        ...state,
        boards: state.boards.map((b) =>
          b.id === action.boardId ? { ...b, autoArchiveDays: action.days } : b
        ),
      };
    case "SET_BOARD_BACKGROUND":
      return {
        ...state,
        boards: state.boards.map((b) => (b.id === action.boardId ? { ...b, background: action.background } : b)),
      };
    case "DELETE_BOARD":
      return { ...state, boards: state.boards.filter((b) => b.id !== action.boardId) };
    case "CLEAR_BOARD":
      return updateBoard(state, action.boardId, (b) => ({ ...b, lists: [], cards: {} }));

    // ---------- Lists ----------
    case "ADD_LIST":
      return updateBoard(state, action.boardId, (b) => ({
        ...b,
        lists: [...b.lists, { id: action.id, title: action.title, color: null, cardIds: [] }],
      }));
    case "RENAME_LIST":
      return updateBoard(state, action.boardId, (b) => ({
        ...b,
        lists: b.lists.map((l) => (l.id === action.listId ? { ...l, title: action.title } : l)),
      }));
    case "SET_LIST_COLOR":
      return updateBoard(state, action.boardId, (b) => ({
        ...b,
        lists: b.lists.map((l) => (l.id === action.listId ? { ...l, color: action.color } : l)),
      }));
    case "SET_LIST_STUCK_HOURS":
      return updateBoard(state, action.boardId, (b) => ({
        ...b,
        lists: b.lists.map((l) => (l.id === action.listId ? { ...l, stuckHours: action.hours } : l)),
      }));
    case "DELETE_LIST":
      return updateBoard(state, action.boardId, (b) => {
        const list = b.lists.find((l) => l.id === action.listId);
        const cards = { ...b.cards };
        (list?.cardIds || []).forEach((cid) => delete cards[cid]);
        // Os arquivados da coluna não estão em cardIds, mas o servidor apaga tudo
        // em cascata com a lista. Sem tirá-los daqui, o modal de arquivados seguia
        // listando cartões que já não existem até o próximo carregamento.
        Object.values(b.cards).forEach((c) => {
          if (c.archived && c.archivedFrom === action.listId) delete cards[c.id];
        });
        return { ...b, lists: b.lists.filter((l) => l.id !== action.listId), cards };
      });
    case "REORDER_LISTS":
      return updateBoard(state, action.boardId, (b) => {
        const map = new Map(b.lists.map((l) => [l.id, l]));
        const lists = action.orderedListIds.map((id) => map.get(id)).filter(Boolean);
        return { ...b, lists };
      });
    case "SORT_LIST_CARDS":
      return updateBoard(state, action.boardId, (b) => ({
        ...b,
        lists: b.lists.map((l) =>
          l.id === action.listId
            ? { ...l, cardIds: [...l.cardIds].sort((x, y) => (b.cards[x]?.title || "").localeCompare(b.cards[y]?.title || "", "pt-BR")) }
            : l
        ),
      }));
    case "CLEAR_LIST_CARDS":
      return updateBoard(state, action.boardId, (b) => {
        const list = b.lists.find((l) => l.id === action.listId);
        const cards = { ...b.cards };
        (list?.cardIds || []).forEach((cid) => delete cards[cid]);
        return { ...b, lists: b.lists.map((l) => (l.id === action.listId ? { ...l, cardIds: [] } : l)), cards };
      });

    // ---------- Cards ----------
    case "ADD_CARD":
      return updateBoard(state, action.boardId, (b) => {
        const card = {
          id: action.id,
          title: action.title,
          description: "",
          labels: [],
          due: null,
          startDate: null,
          location: null,
          checklist: [],
          memberIds: [],
          completed: false,
          urgent: false,
          important: false,
          attachments: [],
          // Otimista: o servidor grava o mesmo instante em `created_at`, mas
          // essa ação nunca aguarda a resposta dele (ver sync.js) - sem isso
          // o cartão recém-criado ficava sem "Criado em" até o próximo reload.
          createdAt: new Date().toISOString(),
        };
        return {
          ...b,
          cards: { ...b.cards, [action.id]: card },
          lists: b.lists.map((l) => (l.id === action.listId ? { ...l, cardIds: [...l.cardIds, action.id] } : l)),
        };
      });
    case "UPDATE_CARD":
      return updateBoard(state, action.boardId, (b) => ({
        ...b,
        cards: { ...b.cards, [action.cardId]: { ...b.cards[action.cardId], ...action.patch } },
      }));
    // Sem case em sync.js de propósito: diferente de UPDATE_CARD (otimista, dispara
    // um PATCH), este só existe pra aplicar no estado uma descrição que o servidor
    // JÁ confirmou (ver commitDescription em CardModal.jsx) - despachar de novo
    // como UPDATE_CARD faria um segundo PATCH em cima do primeiro, à toa.
    case "SET_CARD_DESCRIPTION_LOCAL":
      return updateBoard(state, action.boardId, (b) => ({
        ...b,
        cards: { ...b.cards, [action.cardId]: { ...b.cards[action.cardId], description: action.description } },
      }));
    // Desfaz só o ADD_CARD otimista quando o POST falha (ver sync.js/BoardContext.jsx).
    // Não reaproveita DELETE_CARD porque esse dispara um DELETE no servidor para um
    // id que nunca chegou a existir lá - aqui é limpeza puramente local.
    case "ROLLBACK_ADD_CARD":
      return updateBoard(state, action.boardId, (b) => {
        const cards = { ...b.cards };
        delete cards[action.cardId];
        return { ...b, cards, lists: b.lists.map((l) => (l.id === action.listId ? { ...l, cardIds: l.cardIds.filter((cid) => cid !== action.cardId) } : l)) };
      });
    case "DELETE_CARD":
      return updateBoard(state, action.boardId, (b) => {
        const cards = { ...b.cards };
        delete cards[action.cardId];
        return { ...b, cards, lists: b.lists.map((l) => ({ ...l, cardIds: l.cardIds.filter((cid) => cid !== action.cardId) })) };
      });
    // Arquivar tira o id de cardIds e marca o cartão, que continua em b.cards.
    // Como todas as views montam suas listas percorrendo cardIds (flattenCards),
    // basta isso para o cartão sumir do quadro, da tabela, do mapa e das demais.
    case "ARCHIVE_CARD":
      return updateBoard(state, action.boardId, (b) => {
        const card = b.cards[action.cardId];
        if (!card || card.archived) return b;
        const fromList = b.lists.find((l) => l.cardIds.includes(action.cardId));
        return {
          ...b,
          cards: {
            ...b.cards,
            [action.cardId]: {
              ...card,
              archived: true,
              archivedAt: action.at,
              archivedFrom: fromList?.id ?? null,
            },
          },
          lists: b.lists.map((l) => ({ ...l, cardIds: l.cardIds.filter((cid) => cid !== action.cardId) })),
        };
      });
    // Duplicar entra logo depois do original na mesma lista (não no fim) - é
    // onde quem duplicou espera achar a cópia, sem procurar. attachments fica
    // vazio de propósito: duplicar arquivo é copiar bytes no disco da empresa,
    // fora do escopo de uma ação rápida do card.
    case "DUPLICATE_CARD":
      return updateBoard(state, action.boardId, (b) => {
        const source = b.cards[action.cardId];
        if (!source) return b;
        const card = {
          ...source,
          id: action.newId,
          title: action.title,
          completed: false,
          attachments: [],
          archived: false,
          archivedAt: null,
          archivedFrom: null,
          // O `...source` traria a criação do cartão original - a cópia nasce
          // agora, não quando o cartão duplicado nasceu.
          createdAt: new Date().toISOString(),
        };
        return {
          ...b,
          cards: { ...b.cards, [action.newId]: card },
          lists: b.lists.map((l) => {
            if (!l.cardIds.includes(action.cardId)) return l;
            const cardIds = [...l.cardIds];
            cardIds.splice(cardIds.indexOf(action.cardId) + 1, 0, action.newId);
            return { ...l, cardIds };
          }),
        };
      });
    case "UNARCHIVE_CARD":
      return updateBoard(state, action.boardId, (b) => {
        const card = b.cards[action.cardId];
        if (!card || !card.archived) return b;
        // A coluna de origem pode ter sido apagada enquanto o cartão estava arquivado;
        // nesse caso ele volta para a primeira lista, em vez de sumir sem aviso.
        const target = b.lists.find((l) => l.id === card.archivedFrom) || b.lists[0];
        if (!target) return b;
        return {
          ...b,
          cards: {
            ...b.cards,
            [action.cardId]: { ...card, archived: false, archivedAt: null, archivedFrom: null },
          },
          lists: b.lists.map((l) =>
            l.id === target.id ? { ...l, cardIds: [...l.cardIds, action.cardId] } : l
          ),
        };
      });
    case "ARCHIVE_COMPLETED_CARDS":
      return updateBoard(state, action.boardId, (b) => {
        const list = b.lists.find((l) => l.id === action.listId);
        if (!list) return b;
        const alvo = list.cardIds.filter((cid) => b.cards[cid]?.completed);
        if (alvo.length === 0) return b;
        const cards = { ...b.cards };
        alvo.forEach((cid) => {
          cards[cid] = { ...cards[cid], archived: true, archivedAt: action.at, archivedFrom: list.id };
        });
        return {
          ...b,
          cards,
          lists: b.lists.map((l) =>
            l.id === list.id ? { ...l, cardIds: l.cardIds.filter((cid) => !alvo.includes(cid)) } : l
          ),
        };
      });
    case "MOVE_CARD":
      return updateBoard(state, action.boardId, (b) => {
        const lists = b.lists.map((l) => ({ ...l, cardIds: [...l.cardIds] }));
        const fromList = lists.find((l) => l.id === action.fromListId);
        const toList = lists.find((l) => l.id === action.toListId);
        if (!fromList || !toList) return b;

        if (fromList.id === toList.id) {
          const idx = fromList.cardIds.indexOf(action.cardId);
          if (idx === -1) return b;
          fromList.cardIds.splice(idx, 1);
          let insertAt = action.toIndex;
          if (insertAt > idx) insertAt -= 1;
          insertAt = Math.max(0, Math.min(insertAt, fromList.cardIds.length));
          fromList.cardIds.splice(insertAt, 0, action.cardId);
        } else {
          const idx = fromList.cardIds.indexOf(action.cardId);
          if (idx !== -1) fromList.cardIds.splice(idx, 1);
          let insertAt = action.toIndex;
          insertAt = Math.max(0, Math.min(insertAt, toList.cardIds.length));
          toList.cardIds.splice(insertAt, 0, action.cardId);
          // Trocar de coluna reinicia o relógio do gargalo. Reordenar dentro da
          // mesma lista cai no ramo acima e não mexe na data — senão bastaria
          // arrastar o cartão no lugar para esconder um gargalo real.
          const card = b.cards[action.cardId];
          if (card) {
            return {
              ...b,
              lists,
              cards: { ...b.cards, [action.cardId]: { ...card, listEnteredAt: action.at } },
            };
          }
        }
        return { ...b, lists };
      });
    // Só existe para o sync.js gravar, no fim do arraste, a ordem das colunas que
    // o cartão atravessou. O estado local já está correto desde o primeiro
    // MOVE_CARD, então aqui não há nada a mudar.
    case "COMMIT_CARD_ORDER":
      return state;
    // Concluir move o cartão pra coluna de conclusão do quadro (mesma definição
    // do relatório, ver utils/columnCompletion.js), quando existe uma - sem
    // isso "marcar concluído" e "estar na coluna Concluído" eram dois estados
    // que só concordavam se a pessoa arrastasse o cartão na mão depois. Não
    // existindo coluna assim (ou desmarcando), só o checkbox muda.
    case "TOGGLE_CARD_COMPLETED":
      return updateBoard(state, action.boardId, (b) => {
        const card = b.cards[action.cardId];
        if (!card) return b;
        const completed = !card.completed;
        const cards = { ...b.cards, [action.cardId]: { ...card, completed } };
        let lists = b.lists;
        if (completed) {
          const fromList = b.lists.find((l) => l.cardIds.includes(action.cardId));
          const doneList = b.lists.find((l) => isCompletionColumnTitle(l.title));
          if (fromList && doneList && fromList.id !== doneList.id) {
            lists = b.lists.map((l) => {
              if (l.id === fromList.id) return { ...l, cardIds: l.cardIds.filter((id) => id !== action.cardId) };
              if (l.id === doneList.id) return { ...l, cardIds: [...l.cardIds, action.cardId] };
              return l;
            });
          }
        }
        return { ...b, cards, lists };
      });
    case "TOGGLE_CARD_LABEL":
      return updateBoard(state, action.boardId, (b) => {
        const card = b.cards[action.cardId];
        if (!card) return b;
        const has = card.labels.includes(action.labelId);
        const labels = has ? card.labels.filter((l) => l !== action.labelId) : [...card.labels, action.labelId];
        return { ...b, cards: { ...b.cards, [action.cardId]: { ...card, labels } } };
      });
    case "TOGGLE_CARD_MEMBER":
      return updateBoard(state, action.boardId, (b) => {
        const card = b.cards[action.cardId];
        if (!card) return b;
        const has = (card.memberIds || []).includes(action.memberId);
        const memberIds = has ? card.memberIds.filter((m) => m !== action.memberId) : [...(card.memberIds || []), action.memberId];
        return { ...b, cards: { ...b.cards, [action.cardId]: { ...card, memberIds } } };
      });
    case "ADD_CHECKLIST_ITEM":
      return updateBoard(state, action.boardId, (b) => {
        const card = b.cards[action.cardId];
        if (!card) return b;
        const checklist = [...card.checklist, { text: action.text, done: false }];
        return { ...b, cards: { ...b.cards, [action.cardId]: { ...card, checklist } } };
      });
    case "TOGGLE_CHECKLIST_ITEM":
      return updateBoard(state, action.boardId, (b) => {
        const card = b.cards[action.cardId];
        if (!card) return b;
        const checklist = card.checklist.map((it, i) => (i === action.index ? { ...it, done: !it.done } : it));
        return { ...b, cards: { ...b.cards, [action.cardId]: { ...card, checklist } } };
      });
    case "REMOVE_CHECKLIST_ITEM":
      return updateBoard(state, action.boardId, (b) => {
        const card = b.cards[action.cardId];
        if (!card) return b;
        const checklist = card.checklist.filter((_, i) => i !== action.index);
        return { ...b, cards: { ...b.cards, [action.cardId]: { ...card, checklist } } };
      });
    // Subtarefa é mais rica que item de checklist (responsável, prazo,
    // urgência), por isso identificada por id (gerado por quem despacha, ver
    // CardModal.jsx) em vez de posição no array - com prazo/responsável
    // editáveis fora de ordem, um índice reaproveitado pra tarefa errada
    // depois de reordenar seria um jeito fácil de corromper o item vizinho.
    case "ADD_SUBTASK":
      return updateBoard(state, action.boardId, (b) => {
        const card = b.cards[action.cardId];
        if (!card) return b;
        const subtasks = [
          ...(card.subtasks || []),
          { id: action.id, title: action.title, done: false, assigneeId: null, dueDate: null, urgent: false, important: false },
        ];
        return { ...b, cards: { ...b.cards, [action.cardId]: { ...card, subtasks } } };
      });
    case "TOGGLE_SUBTASK":
      return updateBoard(state, action.boardId, (b) => {
        const card = b.cards[action.cardId];
        if (!card) return b;
        const subtasks = (card.subtasks || []).map((s) => (s.id === action.subtaskId ? { ...s, done: !s.done } : s));
        return { ...b, cards: { ...b.cards, [action.cardId]: { ...card, subtasks } } };
      });
    case "UPDATE_SUBTASK":
      return updateBoard(state, action.boardId, (b) => {
        const card = b.cards[action.cardId];
        if (!card) return b;
        const subtasks = (card.subtasks || []).map((s) => (s.id === action.subtaskId ? { ...s, ...action.patch } : s));
        return { ...b, cards: { ...b.cards, [action.cardId]: { ...card, subtasks } } };
      });
    case "REMOVE_SUBTASK":
      return updateBoard(state, action.boardId, (b) => {
        const card = b.cards[action.cardId];
        if (!card) return b;
        const subtasks = (card.subtasks || []).filter((s) => s.id !== action.subtaskId);
        return { ...b, cards: { ...b.cards, [action.cardId]: { ...card, subtasks } } };
      });
    case "SET_CARD_ATTACHMENTS":
      return updateBoard(state, action.boardId, (b) => {
        const card = b.cards[action.cardId];
        if (!card) return b;
        return { ...b, cards: { ...b.cards, [action.cardId]: { ...card, attachments: action.attachments } } };
      });

    default:
      return state;
  }
}
