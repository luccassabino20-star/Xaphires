import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch } from "../state/BoardContext.jsx";
import { uid } from "../utils/id.js";
import { brightListColor } from "../utils/backgrounds.js";
import CardItem from "./CardItem.jsx";
import ListMenu from "./ListMenu.jsx";

export default function ListColumn({
  board,
  list,
  members,
  searchQuery,
  memberFilter,
  onOpenCard,
  dragCard,
  dragListId,
  onCardDragStart,
  onCardDragEnd,
  onCardHover,
  onListDragStart,
  onListDragEnd,
  onListHover,
}) {
  const { t } = useTranslation();
  const dispatch = useBoardDispatch();
  const [title, setTitle] = useState(list.title);
  const [addingCard, setAddingCard] = useState(false);
  const [newCardText, setNewCardText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef(null);
  const menuBtnRef = useRef(null);

  useEffect(() => {
    setTitle(list.title);
  }, [list.title]);

  function commitTitle() {
    const val = title.trim() || t("board.listColumn.defaultListName");
    dispatch({ type: "RENAME_LIST", boardId: board.id, listId: list.id, title: val });
    setTitle(val);
  }

  function submitNewCard() {
    const val = newCardText.trim();
    if (!val) {
      setAddingCard(false);
      return;
    }
    dispatch({ type: "ADD_CARD", boardId: board.id, listId: list.id, id: uid(), title: val });
    setNewCardText("");
  }

  function handleContainerDragOver(e) {
    if (!dragCard) return;
    e.preventDefault();
    const cardEls = [...containerRef.current.querySelectorAll(".card")];
    let index = cardEls.length;
    for (let i = 0; i < cardEls.length; i++) {
      const rect = cardEls[i].getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }
    onCardHover(list.id, index);
  }

  // Converte o tom antigo gravado no dado para a versão viva, sem migrar o banco.
  const listColor = brightListColor(list.color);
  const listStyle = listColor
    ? { background: `color-mix(in srgb, ${listColor} 16%, var(--bg-column))`, borderTop: `3px solid ${listColor}` }
    : undefined;

  return (
    <div
      className="list"
      style={listStyle}
      onDragOver={(e) => { if (dragListId && dragListId !== list.id) { e.preventDefault(); onListHover(list.id); } }}
    >
      <div className="list-header" draggable onDragStart={() => onListDragStart(list.id)} onDragEnd={onListDragEnd}>
        <input
          className="list-title"
          value={title}
          spellCheck={false}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span className="list-count">{list.cardIds.length}</span>
        <button ref={menuBtnRef} className="list-menu-btn" onClick={() => setMenuOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
          </svg>
        </button>
        {menuOpen && <ListMenu board={board} list={list} onClose={() => setMenuOpen(false)} anchorRef={menuBtnRef} />}
      </div>

      <div className="cards-container" ref={containerRef} onDragOver={handleContainerDragOver}>
        {list.cardIds.map((cardId) => {
          const card = board.cards[cardId];
          if (!card) return null;
          return (
            <CardItem
              key={card.id}
              card={card}
              boardId={board.id}
              members={members}
              searchQuery={searchQuery}
              memberFilter={memberFilter}
              onOpen={() => onOpenCard(card.id)}
              onDragStart={() => onCardDragStart(card.id, list.id)}
              onDragEnd={onCardDragEnd}
            />
          );
        })}
      </div>

      <div className="add-card-wrap">
        {addingCard ? (
          <div className="card-composer">
            <textarea
              autoFocus
              placeholder={t("board.listColumn.cardTitlePlaceholder")}
              value={newCardText}
              onChange={(e) => setNewCardText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitNewCard();
                }
                if (e.key === "Escape") {
                  setAddingCard(false);
                  setNewCardText("");
                }
              }}
            />
            <div className="composer-actions">
              <button className="btn-primary btn-small" onClick={submitNewCard}>
                {t("board.listColumn.addCardBtn")}
              </button>
              <button
                className="btn-cancel"
                onClick={() => {
                  setAddingCard(false);
                  setNewCardText("");
                }}
              >
                &times;
              </button>
            </div>
          </div>
        ) : (
          <button className="add-card-btn" onClick={() => setAddingCard(true)}>
            {t("board.listColumn.addCard")}
          </button>
        )}
      </div>
    </div>
  );
}
