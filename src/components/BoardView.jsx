import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch } from "../state/BoardContext.jsx";
import { uid } from "../utils/id.js";
import ListColumn from "./ListColumn.jsx";

export default function BoardView({ board, members, searchQuery, memberFilter, onOpenCard }) {
  const { t } = useTranslation();
  const dispatch = useBoardDispatch();
  const [dragCard, setDragCard] = useState(null); // { cardId, fromListId }
  const [dragListId, setDragListId] = useState(null);
  const [addingList, setAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const lastMoveKeyRef = useRef(null);
  const lastListOrderKeyRef = useRef(null);
  // Colunas mexidas durante o arraste em curso. A gravação acontece uma vez, no
  // fim, e não a cada posição por onde o cartão passa.
  const touchedListsRef = useRef(new Set());

  function handleCardDragStart(cardId, fromListId) {
    setDragCard({ cardId, fromListId });
    lastMoveKeyRef.current = null;
    touchedListsRef.current = new Set([fromListId]);
  }
  function handleCardDragEnd() {
    const listIds = [...touchedListsRef.current];
    touchedListsRef.current = new Set();
    setDragCard(null);
    lastMoveKeyRef.current = null;
    if (listIds.length > 0) {
      dispatch({ type: "COMMIT_CARD_ORDER", boardId: board.id, listIds });
    }
  }
  function handleCardHover(targetListId, targetIndex) {
    if (!dragCard) return;
    const key = `${targetListId}:${targetIndex}`;
    if (lastMoveKeyRef.current === key) return;
    lastMoveKeyRef.current = key;
    touchedListsRef.current.add(dragCard.fromListId);
    touchedListsRef.current.add(targetListId);
    dispatch({
      type: "MOVE_CARD",
      boardId: board.id,
      cardId: dragCard.cardId,
      fromListId: dragCard.fromListId,
      toListId: targetListId,
      toIndex: targetIndex,
      at: new Date().toISOString(),
    });
    if (targetListId !== dragCard.fromListId) {
      setDragCard({ cardId: dragCard.cardId, fromListId: targetListId });
    }
  }

  function handleListDragStart(listId) {
    setDragListId(listId);
    lastListOrderKeyRef.current = null;
  }
  function handleListDragEnd() {
    setDragListId(null);
    lastListOrderKeyRef.current = null;
  }
  function handleListHover(targetListId) {
    if (!dragListId || dragListId === targetListId) return;
    const ids = board.lists.map((l) => l.id);
    const from = ids.indexOf(dragListId);
    const to = ids.indexOf(targetListId);
    if (from === -1 || to === -1) return;
    const reordered = [...ids];
    reordered.splice(from, 1);
    reordered.splice(to, 0, dragListId);
    const key = reordered.join(",");
    if (lastListOrderKeyRef.current === key) return;
    lastListOrderKeyRef.current = key;
    dispatch({ type: "REORDER_LISTS", boardId: board.id, orderedListIds: reordered });
  }

  function submitNewList() {
    const title = newListTitle.trim();
    if (!title) {
      setAddingList(false);
      setNewListTitle("");
      return;
    }
    dispatch({ type: "ADD_LIST", boardId: board.id, id: uid(), title });
    setNewListTitle("");
  }

  return (
    <main className="board-wrapper">
      <div className="board">
        {board.lists.map((list) => (
          <ListColumn
            key={list.id}
            board={board}
            list={list}
            members={members}
            searchQuery={searchQuery}
            memberFilter={memberFilter}
            onOpenCard={onOpenCard}
            dragCard={dragCard}
            dragListId={dragListId}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleCardDragEnd}
            onCardHover={handleCardHover}
            onListDragStart={handleListDragStart}
            onListDragEnd={handleListDragEnd}
            onListHover={handleListHover}
          />
        ))}

        <div className="list-composer-wrap">
          {addingList ? (
            <div className="list-composer">
              <input
                autoFocus
                placeholder={t("board.boardView.listTitlePlaceholder")}
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNewList();
                  if (e.key === "Escape") {
                    setAddingList(false);
                    setNewListTitle("");
                  }
                }}
              />
              <div className="composer-actions">
                <button className="btn-primary btn-small" onClick={submitNewList}>
                  {t("board.boardView.addList")}
                </button>
                <button
                  className="btn-cancel"
                  onClick={() => {
                    setAddingList(false);
                    setNewListTitle("");
                  }}
                >
                  &times;
                </button>
              </div>
            </div>
          ) : (
            <button className="add-list-btn" onClick={() => setAddingList(true)}>
              {t("board.boardView.addAnotherList")}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
