import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch, useBoardState, useBoardRefetch } from "../state/BoardContext.jsx";
import { useUsers } from "../state/UsersContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import { exportAll, exportBoard, parseImportFile } from "../utils/importExport.js";
import { BACKGROUND_COLORS, BACKGROUND_GRADIENTS, monochromaticGradient } from "../utils/backgrounds.js";
import * as api from "../state/api.js";

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path fill="currentColor" d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" style={{ marginLeft: "auto" }}>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DataMenu({ board, onSelectBoard }) {
  const { t } = useTranslation();
  const state = useBoardState();
  const dispatch = useBoardDispatch();
  const refetchBoards = useBoardRefetch();
  const { users } = useUsers();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("main"); // "main" | "background"
  const [importing, setImporting] = useState(false);
  const [customColor, setCustomColor] = useState("#4d7ea8");
  const [monoColor, setMonoColor] = useState("#4d7ea8");
  const ref = useRef(null);
  const btnRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function closeMenu() {
    setOpen(false);
    setView("main");
  }

  function handleExportCurrent() {
    if (!board) return;
    exportBoard(board, users);
    showToast(t("app.dataMenu.exportBoardToast"));
    closeMenu();
  }
  function handleExportAll() {
    exportAll(state, users);
    showToast(t("app.dataMenu.exportAllToast"));
    closeMenu();
  }
  function handleImportClick() {
    fileInputRef.current?.click();
  }
  function applyBackground(css) {
    if (!board) return;
    dispatch({ type: "SET_BOARD_BACKGROUND", boardId: board.id, background: css });
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    closeMenu();
    try {
      const parsed = await parseImportFile(file, t("app.dataMenu.importedBoardTitle"));
      let lastBoardId = null;
      for (const b of parsed.boards) {
        const created = await api.createBoard({ title: b.title || t("app.dataMenu.importedBoardTitle") });
        lastBoardId = created.id;
        for (const l of b.lists || []) {
          const listCreated = await api.createList(created.id, { title: l.title || t("board.listColumn.defaultListName") });
          const cardsById = b.cards || {};
          for (const cardId of l.cardIds || []) {
            const c = cardsById[cardId];
            if (!c) continue;
            const cardCreated = await api.createCard(listCreated.id, { title: c.title || t("board.cardModal.untitled") });
            const memberIds = (c.memberIds || []).filter((oldId) => users.some((u) => u.id === oldId));
            await api.updateCard(cardCreated.id, {
              description: c.description || "",
              labels: c.labels || [],
              due: c.due || null,
              checklist: c.checklist || [],
              memberIds,
            });
          }
        }
      }
      await refetchBoards();
      if (lastBoardId) onSelectBoard?.(lastBoardId);
      showToast(t("app.dataMenu.importSuccessToast"));
    } catch (err) {
      alert(t("app.dataMenu.importFailAlert", { message: translateError(err, t) }));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="data-menu">
      <button
        ref={btnRef}
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        title={t("app.dataMenu.moreOptions")}
        aria-label={t("app.dataMenu.moreOptions")}
      >
        <DotsIcon />
      </button>
      {open && (
        <div className="dropdown data-dropdown" ref={ref}>
          {view === "main" ? (
            <>
              <div
                className={"dropdown-item" + (!board ? " disabled" : "")}
                onClick={() => board && setView("background")}
              >
                {t("app.dataMenu.personalize")}
                <ChevronRightIcon />
              </div>
              <div className="dropdown-divider" />
              <div className="board-bg-section-label">{t("app.dataMenu.dataSection")}</div>
              <div className={"dropdown-item" + (!board ? " disabled" : "")} onClick={handleExportCurrent}>
                {t("app.dataMenu.exportCurrent")}
              </div>
              <div className="dropdown-item" onClick={handleExportAll}>
                {t("app.dataMenu.exportAll")}
              </div>
              <div className="dropdown-item" onClick={handleImportClick}>
                {importing ? t("app.dataMenu.importing") : t("app.dataMenu.importJson")}
              </div>
            </>
          ) : (
            <>
              <div className="dropdown-item data-menu-back" onClick={() => setView("main")}>
                <ChevronLeftIcon /> {t("app.dataMenu.personalize")}
              </div>
              <div className="dropdown-divider" />
              <div className="board-bg-section-label">{t("app.dataMenu.colors")}</div>
              <div className="board-bg-swatch-grid">
                {BACKGROUND_COLORS.map((c) => (
                  <button
                    key={c.id}
                    className={"board-bg-swatch" + (board?.background === c.css ? " active" : "")}
                    style={{ background: c.css }}
                    onClick={() => applyBackground(c.css)}
                    title={c.id}
                  />
                ))}
              </div>

              <div className="board-bg-section-label">{t("app.dataMenu.gradients")}</div>
              <div className="board-bg-swatch-grid">
                {BACKGROUND_GRADIENTS.map((g) => (
                  <button
                    key={g.id}
                    className={"board-bg-swatch" + (board?.background === g.css ? " active" : "")}
                    style={{ background: g.css }}
                    onClick={() => applyBackground(g.css)}
                    title={g.id}
                  />
                ))}
              </div>

              <div className="board-bg-section-label">{t("app.dataMenu.monoGradientTitle")}</div>
              <div className="board-bg-mono-row">
                <input type="color" value={monoColor} onChange={(e) => setMonoColor(e.target.value)} />
                <div className="board-bg-mono-preview" style={{ background: monochromaticGradient(monoColor) }} />
                <button className="btn-primary btn-small" onClick={() => applyBackground(monochromaticGradient(monoColor))}>
                  {t("app.dataMenu.apply")}
                </button>
              </div>
              <p className="board-bg-mono-hint">{t("app.dataMenu.monoGradientHint")}</p>

              <div className="board-bg-section-label">{t("app.dataMenu.customColor")}</div>
              <div className="board-bg-custom-row">
                <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} />
                <button className="btn-primary btn-small" onClick={() => applyBackground(customColor)}>
                  {t("app.dataMenu.apply")}
                </button>
              </div>

              <div className="dropdown-divider" />
              <div className="dropdown-item" onClick={() => applyBackground(null)}>
                {t("app.dataMenu.noBackground")}
              </div>
            </>
          )}
        </div>
      )}
      <input
        type="file"
        accept="application/json"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </div>
  );
}
