import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch } from "../state/BoardContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { LIST_COLORS, brightListColor } from "../utils/backgrounds.js";

export default function ListMenu({ board, list, onClose, anchorRef }) {
  const { t } = useTranslation();
  const dispatch = useBoardDispatch();
  const showToast = useToast();
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [stuckOpen, setStuckOpen] = useState(false);
  const [stuckHoras, setStuckHoras] = useState(String(list.stuckHours || 48));
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
  function salvarMonitor(horas) {
    const n = Number(horas);
    if (horas !== null && (!Number.isInteger(n) || n < 1 || n > 8760)) {
      showToast(t("board.listMenu.stuckInvalid"));
      return;
    }
    dispatch({ type: "SET_LIST_STUCK_HOURS", boardId: board.id, listId: list.id, hours: horas === null ? null : n });
    showToast(horas === null ? t("board.listMenu.stuckOff") : t("board.listMenu.stuckOn", { hours: n }));
    onClose();
  }
  function archiveCompleted() {
    const total = list.cardIds.filter((cid) => board.cards[cid]?.completed).length;
    if (total === 0) {
      showToast(t("board.listMenu.noCompletedToArchive"));
      onClose();
      return;
    }
    dispatch({ type: "ARCHIVE_COMPLETED_CARDS", boardId: board.id, listId: list.id, at: new Date().toISOString() });
    showToast(t("board.listMenu.cardsArchivedToast", { count: total }));
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
          style={{ background: brightListColor(list.color) || "transparent", borderStyle: list.color ? "solid" : "dashed" }}
        />
        {t("board.listMenu.listColor")}
      </div>
      {colorPickerOpen && (
        <div className="list-color-picker">
          {LIST_COLORS.map((c) => (
            <button
              key={c.id}
              className={"list-color-swatch" + (brightListColor(list.color) === c.css ? " active" : "")}
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
      <div className="dropdown-item" onClick={() => setStuckOpen((o) => !o)}>
        {list.stuckHours
          ? t("board.listMenu.stuckConfigured", { hours: list.stuckHours })
          : t("board.listMenu.stuckConfigure")}
      </div>
      {stuckOpen && (
        <div className="list-stuck-config">
          <p>{t("board.listMenu.stuckHint")}</p>
          <div className="list-stuck-row">
            <input
              type="number"
              min="1"
              max="8760"
              value={stuckHoras}
              onChange={(e) => setStuckHoras(e.target.value)}
            />
            <span>{t("board.listMenu.stuckHoursSuffix")}</span>
            <button className="btn-primary btn-small" onClick={() => salvarMonitor(stuckHoras)}>
              {t("board.listMenu.stuckSave")}
            </button>
          </div>
          {list.stuckHours && (
            <button className="btn-cancel list-stuck-off" onClick={() => salvarMonitor(null)}>
              {t("board.listMenu.stuckDisable")}
            </button>
          )}
        </div>
      )}
      <div className="dropdown-item" onClick={archiveCompleted}>
        {t("board.listMenu.archiveCompleted")}
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
