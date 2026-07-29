import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch, useBoardState } from "../state/BoardContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { uid } from "../utils/id.js";

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" className="board-lock-icon">
      <path fill="currentColor" d="M12 2a4 4 0 0 1 4 4v3h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1V6a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v3h4V6a2 2 0 0 0-2-2z" />
    </svg>
  );
}
function NotesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15">
      <path fill="currentColor" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM7 7h10v2H7zm0 4h10v2H7zm0 4h7v2H7z" />
    </svg>
  );
}

export default function Sidebar({ collapsed, activeBoardId, onSelectBoard, screen, onOpenMinutes }) {
  const { t } = useTranslation();
  const state = useBoardState();
  const dispatch = useBoardDispatch();
  const { user } = useAuth();
  const showToast = useToast();
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPrivate, setNewPrivate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");

  const sharedBoards = state.boards.filter((b) => b.visibility !== "private");
  // "Meus" é o que a pessoa criou. Quadro privado de outra pessoa só chega aqui se
  // ela tiver sido convidada, e fica numa seção própria — listar junto com os
  // próprios daria a impressão de que ela pode excluir e compartilhar.
  const privateBoards = state.boards.filter((b) => b.visibility === "private" && b.myRole === "owner");
  const sharedWithMe = state.boards.filter((b) => b.visibility === "private" && b.myRole !== "owner");

  function addBoard() {
    const title = newTitle.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    const id = uid();
    dispatch({ type: "ADD_BOARD", id, title, ownerId: user.id, visibility: newPrivate ? "private" : "shared" });
    onSelectBoard(id);
    setNewTitle("");
    setNewPrivate(false);
    setAdding(false);
  }

  function startRename(board) {
    setEditingId(board.id);
    setEditingTitle(board.title);
  }
  function commitRename(board) {
    const title = editingTitle.trim() || board.title;
    dispatch({ type: "RENAME_BOARD", boardId: board.id, title });
    setEditingId(null);
  }
  function deleteBoard(board) {
    if (!confirm(t("app.sidebar.deleteBoardConfirm", { title: board.title }))) return;
    dispatch({ type: "DELETE_BOARD", boardId: board.id });
    showToast(t("app.sidebar.boardDeletedToast"));
  }

  function renderBoardItem(b) {
    // No privado quem exclui é o dono, não quem tem acesso: o convidado veria o
    // botão e levaria 403, ou pior, apagaria o quadro de quem o convidou.
    const canDelete = b.visibility === "private" ? b.myRole === "owner" : user.role === "master";
    return (
      <div key={b.id} className={"board-list-item" + (screen === "board" && b.id === activeBoardId ? " active" : "")}>
        {editingId === b.id ? (
          <input
            className="board-rename-input"
            autoFocus
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onBlur={() => commitRename(b)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename(b);
              if (e.key === "Escape") setEditingId(null);
            }}
          />
        ) : (
          <button
            className="board-list-btn"
            onClick={() => onSelectBoard(b.id)}
            onDoubleClick={() => b.myRole !== "viewer" && startRename(b)}
          >
            <span className="board-swatch" />
            <span className="board-list-title">{b.title}</span>
            {b.visibility === "private" && <LockIcon />}
            {b.sharedWith?.length > 0 && (
              <span className="board-share-count" title={t("app.sidebar.sharedWithCount", { count: b.sharedWith.length })}>
                {b.sharedWith.length}
              </span>
            )}
          </button>
        )}
        {canDelete && (
          <button className="board-list-delete" title={t("app.sidebar.deleteBoardTitle")} onClick={() => deleteBoard(b)}>
            &times;
          </button>
        )}
      </div>
    );
  }

  return (
    <aside className={"sidebar" + (collapsed ? " collapsed" : "")}>
      <button className={"sidebar-minutes-nav" + (screen === "minutes" ? " active" : "")} onClick={onOpenMinutes}>
        <span className="sidebar-minutes-nav-icon"><NotesIcon /></span>
        {t("app.sidebar.minutesNav")}
      </button>
      <div className="sidebar-divider" />

      <div className="sidebar-header">{t("app.sidebar.sharedBoards")}</div>
      <div className="board-list">{sharedBoards.map(renderBoardItem)}</div>

      {privateBoards.length > 0 && (
        <>
          <div className="sidebar-header sidebar-header-secondary">
            <LockIcon /> {t("app.sidebar.myPrivateBoards")}
          </div>
          <div className="board-list">{privateBoards.map(renderBoardItem)}</div>
        </>
      )}

      {sharedWithMe.length > 0 && (
        <>
          <div className="sidebar-header sidebar-header-secondary">
            <LockIcon /> {t("app.sidebar.sharedWithMe")}
          </div>
          <div className="board-list">{sharedWithMe.map(renderBoardItem)}</div>
        </>
      )}

      {adding ? (
        <div className="board-add-form">
          <input
            autoFocus
            placeholder={t("app.sidebar.boardNamePlaceholder")}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addBoard();
              if (e.key === "Escape") {
                setAdding(false);
                setNewTitle("");
              }
            }}
          />
          <label className="board-add-private-toggle">
            <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} />
            <LockIcon />
            <span>{t("app.sidebar.privateToggle")}</span>
          </label>
          <div className="composer-actions">
            <button className="btn-primary btn-small" onClick={addBoard}>
              {t("app.sidebar.create")}
            </button>
            <button
              className="btn-cancel"
              onClick={() => {
                setAdding(false);
                setNewTitle("");
                setNewPrivate(false);
              }}
            >
              &times;
            </button>
          </div>
        </div>
      ) : (
        <button className="sidebar-add-board" onClick={() => setAdding(true)}>
          {t("app.sidebar.newBoard")}
        </button>
      )}
    </aside>
  );
}
