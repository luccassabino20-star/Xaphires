import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch } from "../state/BoardContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { BACKGROUND_COLORS } from "../utils/backgrounds.js";

export default function ListMenu({ board, list, onClose, anchorRef }) {
  const { t } = useTranslation();
  const dispatch = useBoardDispatch();
  const showToast = useToast();
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) && !anchorRef.current?.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef]);

  function sortCards() {
    dispatch({ type: "SORT_LIST_CARDS", boardId: board.id, listId: list.id });
    onClose();
  }
  function clearCards() {
    if (confirm(t("board.listMenu.clearCardsConfirm", { title: list.title }))) {
      dispatch({ type: "CLEAR_LIST_CARDS", boardId: board.id, listId: list.id });
      showToast(t("board.listMenu.cardsRemovedToast"));
    }
    onClose();
  }
  function deleteList() {
    if (confirm(t("board.listMenu.deleteListConfirm", { title: list.title }))) {
      dispatch({ type: "DELETE_LIST", boardId: board.id, listId: list.id });
      showToast(t("board.listMenu.listDeletedToast"));
    }
    onClose();
  }
  function applyColor(color) {
    dispatch({ type: "SET_LIST_COLOR", boardId: board.id, listId: list.id, color });
  }

  return (
    <div className="dropdown" ref={ref}>
      <div className="dropdown-item" onClick={() => setColorPickerOpen((o) => !o)}>
        <span
          className="list-color-swatch-icon"
          style={{ background: list.color || "transparent", borderStyle: list.color ? "solid" : "dashed" }}
        />
        {t("board.listMenu.listColor")}
      </div>
      {colorPickerOpen && (
        <div className="list-color-picker">
          {BACKGROUND_COLORS.map((c) => (
            <button
              key={c.id}
              className={"list-color-swatch" + (list.color === c.css ? " active" : "")}
              style={{ background: c.css }}
              onClick={() => applyColor(c.css)}
              title={c.id}
            />
          ))}
          <button className="list-color-swatch list-color-swatch-none" onClick={() => applyColor(null)} title={t("board.listMenu.defaultColor")}>
            &times;
          </button>
        </div>
      )}

      <div className="dropdown-divider" />
      <div className="dropdown-item" onClick={sortCards}>
        {t("board.listMenu.sortAZ")}
      </div>
      <div className="dropdown-item" onClick={clearCards}>
        {t("board.listMenu.clearCards")}
      </div>
      <div className="dropdown-divider" />
      <div className="dropdown-item danger" onClick={deleteList}>
        {t("board.listMenu.deleteList")}
      </div>
    </div>
  );
}
