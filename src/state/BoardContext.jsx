import { createContext, useContext, useEffect, useReducer, useRef } from "react";
import { useTranslation } from "react-i18next";
import { reducer } from "./reducer.js";
import { syncAction } from "./sync.js";
import { getWorkspace } from "./api.js";
import { useToast } from "./ToastContext.jsx";
import { translateError } from "../utils/errors.js";

const BoardStateContext = createContext(null);
const BoardDispatchContext = createContext(null);
const BoardRefetchContext = createContext(() => {});

export function BoardProvider({ children }) {
  const [state, dispatchRaw] = useReducer(reducer, { boards: [], hydrated: false });
  const pendingRef = useRef([]);
  const showToast = useToast();
  const { t } = useTranslation();

  async function refetch() {
    const data = await getWorkspace();
    dispatchRaw({ type: "HYDRATE", boards: data.boards });
  }

  useEffect(() => {
    refetch();
  }, []);

  function dispatch(action) {
    pendingRef.current.push(action);
    dispatchRaw(action);
  }

  useEffect(() => {
    if (pendingRef.current.length === 0) return;
    const actions = pendingRef.current;
    pendingRef.current = [];
    actions.forEach((action) => {
      const result = syncAction(action, state);
      // Só ADD_CARD devolve a promise (ver sync.js) - é o único caso com
      // rollback local, então os demais seguem fire-and-forget como sempre.
      if (action.type === "ADD_CARD" && result?.catch) {
        result.catch((err) => {
          dispatchRaw({ type: "ROLLBACK_ADD_CARD", boardId: action.boardId, listId: action.listId, cardId: action.id });
          showToast(translateError(err, t));
        });
      }
    });
  }, [state, showToast, t]);

  return (
    <BoardStateContext.Provider value={state}>
      <BoardDispatchContext.Provider value={dispatch}>
        <BoardRefetchContext.Provider value={refetch}>{children}</BoardRefetchContext.Provider>
      </BoardDispatchContext.Provider>
    </BoardStateContext.Provider>
  );
}

export function useBoardState() {
  return useContext(BoardStateContext);
}
export function useBoardDispatch() {
  return useContext(BoardDispatchContext);
}
export function useBoardRefetch() {
  return useContext(BoardRefetchContext);
}
