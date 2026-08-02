import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useBoardDispatch, useBoardState } from "../state/BoardContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { useChat } from "../state/ChatContext.jsx";
import { uid } from "../utils/id.js";
import * as api from "../state/api.js";
import UsersPanel from "./UsersPanel.jsx";
import PlanModal from "./PlanModal.jsx";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import AccountMenu from "./AccountMenu.jsx";

// Mesmo lazy load de AccountMenu.jsx: o painel de plataforma arrasta os
// componentes de administração junto, e só quem abre precisa pagar o peso.
const PlataformaModal = lazy(() => import("./PlataformaModal.jsx"));

/* ---------- Ícones (viewBox 24x24, fill=currentColor - mesmo molde do resto
   do app, ver CardItem.jsx/ganttIcons.jsx). Sem lib de ícone nova só pra isto. ---------- */
function Svg({ d, size = 18, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...rest}>
      <path fill="currentColor" d={d} />
    </svg>
  );
}
function IconHome(p) {
  return <Svg {...p} d="M12 3 3 10.5V21h6v-6h6v6h6V10.5z" />;
}
function IconCalendar(p) {
  return <Svg {...p} d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm12 8v9H5v-9z" />;
}
function IconSparkle(p) {
  return <Svg {...p} d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />;
}
function IconUsers(p) {
  return <Svg {...p} d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5zm8.5-3.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm.5 1.7c-.4-.1-.9-.2-1.4-.2-1 0-2.1.2-3.1.7 1.9 1.1 3.2 2.8 3.5 4.8H23v-1.5c0-1.9-1.9-3.3-4-3.8z" />;
}
function IconChart(p) {
  return <Svg {...p} d="M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z" />;
}
function IconGrid(p) {
  return <Svg {...p} d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z" />;
}
function IconDotsGrid(p) {
  return <Svg {...p} d="M6 6h2v2H6zm5 0h2v2h-2zm5 0h2v2h-2zM6 11h2v2H6zm5 0h2v2h-2zm5 0h2v2h-2zM6 16h2v2H6zm5 0h2v2h-2zm5 0h2v2h-2z" />;
}
function IconInvite(p) {
  return <Svg {...p} d="M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-8 2-8 5v2h11.5A6 6 0 0 1 20 13.3V13c-2-.7-4-1-6.5-1H10zM19 15v3h3v2h-3v3h-2v-3h-3v-2h3v-3z" />;
}
function IconUpgrade(p) {
  return <Svg {...p} d="M12 3l7 7h-4v9h-6v-9H5z" />;
}
function IconInbox(p) {
  return <Svg {...p} d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 2v6h4.5a3.5 3.5 0 0 0 7 0H20V6zm0 8v4h16v-4h-3.6a5.5 5.5 0 0 1-8.8 0z" />;
}
function IconReply(p) {
  return <Svg {...p} d="M10 8V4l-8 7 8 7v-4.1c4 0 6.8 1.3 9 4.1-.8-4.4-3.4-8.7-9-9z" />;
}
function IconAt(p) {
  return <Svg {...p} d="M12 2a10 10 0 1 0 6.3 17.8l-1.2-1.6A8 8 0 1 1 20 12v1c0 1.1-.5 2-1.5 2s-1.5-.9-1.5-2v-4h-1.8l-.1.7A3.5 3.5 0 1 0 15.5 15c.6.9 1.7 1.5 3 1.5 2.2 0 3.5-1.7 3.5-4v-1A10 10 0 0 0 12 2zm0 7.5A2.5 2.5 0 1 1 12 14a2.5 2.5 0 0 1 0-4.5z" />;
}
function IconVideo(p) {
  return <Svg {...p} d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" />;
}
function IconCheckCircle(p) {
  return <Svg {...p} d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.4-4.2-4.2 1.4-1.4 2.8 2.8 5.8-5.8 1.4 1.4z" />;
}
function IconDots(p) {
  return <Svg {...p} d="M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />;
}
function IconChevronDown(p) {
  return <Svg {...p} d="M6.7 8.3 5.3 9.7l6.7 6.7 6.7-6.7-1.4-1.4L12 13.6z" />;
}
function IconPlus(p) {
  return <Svg {...p} d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />;
}
function IconFolder(p) {
  return <Svg {...p} d="M4 5a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5z" />;
}
function IconList(p) {
  return <Svg {...p} d="M3 5h18v2H3zm0 6h18v2H3zm0 6h12v2H3z" />;
}
function IconLock(p) {
  return <Svg {...p} d="M12 2a4 4 0 0 1 4 4v3h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1V6a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v3h4V6a2 2 0 0 0-2-2z" />;
}
function IconChatBubble(p) {
  return <Svg {...p} d="M4 4h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-4.4 3.3A.5.5 0 0 1 3 21V5a1 1 0 0 1 1-1z" />;
}
function IconBot(p) {
  return <Svg {...p} d="M12 2a2 2 0 0 1 2 2c0 .4-.1.8-.4 1.1L13 6h3a4 4 0 0 1 4 4v1a2 2 0 0 1 0 4v1a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-1a2 2 0 0 1 0-4v-1a4 4 0 0 1 4-4h3l-.6-.9A1.9 1.9 0 0 1 10 4a2 2 0 0 1 2-2zM9 11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />;
}

// Uma linha do rail primário. `active`/`onClick` reais quando a seção existe
// de verdade no Xaphires; sem onClick é decoração da referência do ClickUp
// (ver decisão registrada na conversa) - fica no visual, não faz nada.
function RailItem({ icon, label, active, onClick }) {
  return (
    <button type="button" className={"dsb-rail-item" + (active ? " active" : "")} onClick={onClick} disabled={!onClick}>
      <span className="dsb-rail-item-icon">{icon}</span>
      <span className="dsb-rail-item-label">{label}</span>
    </button>
  );
}

// Uma linha de atalho no painel branco (Caixa de entrada, Respostas...) -
// mesmo espírito do RailItem: sem onClick, é só a referência visual.
function ShortcutRow({ icon, label, badge, onClick }) {
  return (
    <button type="button" className="dsb-shortcut-row" onClick={onClick} disabled={!onClick}>
      <span className="dsb-shortcut-icon">{icon}</span>
      <span className="dsb-shortcut-label">{label}</span>
      {badge != null && <span className="dsb-badge-pink">{badge}</span>}
    </button>
  );
}

export default function Sidebar({ collapsed, activeBoardId, onSelectBoard }) {
  const { t } = useTranslation();
  const state = useBoardState();
  const dispatch = useBoardDispatch();
  const { user } = useAuth();
  const showToast = useToast();
  // ChatModal em si continua sendo montado só pela TopBar (mesmo estado
  // compartilhado de useChat) - renderizar aqui de novo duplicaria o modal
  // na tela quando aberto. Esta barra só precisa do gatilho e do contador.
  const { totalUnread, openChat } = useChat();
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPrivate, setNewPrivate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [usersPanelOpen, setUsersPanelOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [plataformaOpen, setPlataformaOpen] = useState(false);
  // null = sem teto (ou ainda não carregou - getPlan() tem cache de 30s em
  // api.js, então não é uma requisição a mais por render). A contagem em si
  // vem do estado real (state.boards.length), não desta resposta: ela muda a
  // cada quadro criado/excluído, e recontar aqui ficaria sempre um passo atrás.
  const [maxBoards, setMaxBoards] = useState(null);

  useEffect(() => {
    let ativo = true;
    api
      .getPlan()
      .then((p) => ativo && setMaxBoards(p.maxBoards))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  // Flyout do "Mais": bate-papo/idioma/tema moraram na fileira sempre visível
  // do painel branco antes; agora só aparecem aqui, sob demanda. Portal +
  // position:fixed pelo mesmo motivo de sempre (DatePicker.jsx) - o rail fica
  // colado na borda esquerda da janela, e um popover relativo ficaria cortado.
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreCoords, setMoreCoords] = useState(null);
  const moreBtnRef = useRef(null);
  const moreMenuRef = useRef(null);

  useLayoutEffect(() => {
    if (!moreOpen) return;
    const rect = moreBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ESTIMATED_HEIGHT = 170;
    setMoreCoords({
      top: Math.min(rect.top, window.innerHeight - ESTIMATED_HEIGHT - 12),
      left: rect.right + 8,
    });
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    function onDocClick(e) {
      if (moreBtnRef.current?.contains(e.target)) return;
      if (moreMenuRef.current?.contains(e.target)) return;
      setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [moreOpen]);

  const sharedBoards = state.boards.filter((b) => b.visibility !== "private");
  // "Meus" é o que a pessoa criou. Quadro privado de outra pessoa só chega aqui se
  // ela tiver sido convidada, e fica numa seção própria — listar junto com os
  // próprios daria a impressão de que ela pode excluir e compartilhar.
  const privateBoards = state.boards.filter((b) => b.visibility === "private" && b.myRole === "owner");
  const sharedWithMe = state.boards.filter((b) => b.visibility === "private" && b.myRole !== "owner");

  // Gatilho dos três "+ novo quadro" (cabeçalho, ícone da seção, botão no fim
  // da árvore) - checa o teto ANTES de abrir o formulário. O servidor também
  // recusa (routes/boards.js), mas ADD_BOARD é otimista (ver reducer.js): se a
  // checagem só existisse lá, o quadro apareceria na hora e sumiria sozinho no
  // próximo refetch, sem explicação nenhuma - o erro de sync só vai pro console.
  function startAdding() {
    if (maxBoards !== null && state.boards.length >= maxBoards) {
      showToast(t("errors.BOARD_LIMIT_REACHED"));
      return;
    }
    setAdding(true);
  }

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

  // Nível "lista" da árvore - um quadro de verdade, com a mesma ação de
  // sempre (abrir/renomear/excluir). O contador à direita é a contagem real
  // de cartões do quadro (workspace já traz cards junto, ver BoardContext),
  // não um número de mentira - só troca de "3 pontinhos" pro estilo
  // "número discreto" que a referência usa.
  function renderBoardItem(b) {
    const canDelete = b.visibility === "private" ? b.myRole === "owner" : user.role === "master";
    const cardCount = Object.keys(b.cards || {}).length;
    return (
      <div key={b.id} className={"dsb-tree-item" + (b.id === activeBoardId ? " active" : "")}>
        {editingId === b.id ? (
          <input
            className="dsb-tree-rename-input"
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
            className="dsb-tree-btn"
            onClick={() => onSelectBoard(b.id)}
            onDoubleClick={() => b.myRole !== "viewer" && startRename(b)}
          >
            <IconList size={14} className="dsb-tree-list-icon" />
            <span className="dsb-tree-title">{b.title}</span>
            {b.visibility === "private" && <IconLock size={11} className="dsb-tree-lock" />}
            {cardCount > 0 && <span className="dsb-tree-count">{cardCount}</span>}
          </button>
        )}
        {canDelete && (
          <button className="dsb-tree-delete" title={t("app.sidebar.deleteBoardTitle")} onClick={() => deleteBoard(b)}>
            &times;
          </button>
        )}
      </div>
    );
  }

  // Nível "espaço" da árvore - um grupo real dos três que o quadro já tinha
  // (compartilhados / meus privados / compartilhados comigo), só reembalado
  // no visual de pasta colorida + lista que a referência usa em vez do
  // cabeçalho de texto que existia antes.
  function renderSpaceGroup(key, label, boards, colorClass) {
    if (boards.length === 0 && key !== "shared") return null;
    return (
      <div className="dsb-space-group" key={key}>
        <div className="dsb-space-header">
          <span className={"dsb-space-swatch " + colorClass}>{label.charAt(0)}</span>
          <span className="dsb-space-title">{label}</span>
        </div>
        <div className="dsb-tree-folder">
          <IconFolder size={13} className="dsb-tree-folder-icon" />
          <span className="dsb-tree-folder-title">{t("app.sidebar.boardsFolder")}</span>
        </div>
        <div className="dsb-tree-list">{boards.map(renderBoardItem)}</div>
      </div>
    );
  }

  return (
    <div className={"dsb-shell" + (collapsed ? " dsb-shell-collapsed" : "")}>
      {/* ---------- Barra primária (global, sempre escura) ---------- */}
      <nav className="dsb-rail">
        <div className="dsb-rail-top">
          {/* Real: menu da conta de verdade (nome/e-mail, plano, trocar
              senha, sair) - antes ficava no painel branco, agora mora aqui
              no topo do rail escuro, no lugar do logo genérico do ClickUp. */}
          <AccountMenu />
        </div>

        <div className="dsb-rail-nav">
          <RailItem icon={<IconHome />} label={t("app.sidebar.rail.home")} active />
          {/* PLACEHOLDER: Planejador/IA/Painéis/Quadros/Mais não têm tela nem
              dado por trás no Xaphires hoje - ver decisão registrada na
              conversa ("visual completo, com placeholders"). Ficam sem
              onClick de propósito. */}
          <RailItem icon={<IconCalendar />} label={t("app.sidebar.rail.planner")} />
          <RailItem icon={<IconSparkle />} label={t("app.sidebar.rail.ai")} />
          <RailItem
            icon={<IconUsers />}
            label={t("app.sidebar.rail.team")}
            onClick={user.role === "master" ? () => setUsersPanelOpen(true) : undefined}
          />
          <RailItem icon={<IconChart />} label={t("app.sidebar.rail.dashboards")} />
          <RailItem icon={<IconGrid />} label={t("app.sidebar.rail.boards")} />
          {/* Real: abre o flyout com idioma/tema (e, para quem administra a
              plataforma, o painel de administração) - ver moreOpen acima.
              Não é mais placeholder. */}
          <button
            type="button"
            ref={moreBtnRef}
            className={"dsb-rail-item" + (moreOpen ? " active" : "")}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <span className="dsb-rail-item-icon">
              <IconDotsGrid />
            </span>
            <span className="dsb-rail-item-label">{t("app.sidebar.rail.more")}</span>
          </button>
        </div>

        <div className="dsb-rail-bottom">
          {/* PLACEHOLDER: convite por e-mail não existe - quem administra
              cria a conta direto no painel de Equipe (ver Equipes acima). */}
          <RailItem icon={<IconInvite />} label={t("app.sidebar.rail.invite")} />
          <button type="button" className="dsb-rail-upgrade" onClick={() => setPlanOpen(true)} title={t("plan.menuItem")}>
            <IconUpgrade size={16} />
          </button>
        </div>
      </nav>

      {/* ---------- Painel secundário (branco, conteúdo do workspace) ---------- */}
      <aside className="dsb-panel">
        <div className="dsb-panel-header">
          {/* Real: nome de quem está logado. Sem seletor de múltiplos
              workspaces no Xaphires (uma empresa por login) - o "v" fica só
              de enfeite, clicar não abre nada (PLACEHOLDER). */}
          <button type="button" className="dsb-workspace-btn" disabled>
            <span className="dsb-workspace-title">{t("app.sidebar.workspaceLabel", { name: user.name })}</span>
            <IconChevronDown size={13} />
          </button>
        </div>

        <div className="dsb-panel-titlebar">
          <span className="dsb-panel-title">{t("app.sidebar.rail.home")}</span>
          <button type="button" className="dsb-create-btn" onClick={startAdding}>
            <IconPlus size={13} />
            {t("app.sidebar.create")}
          </button>
        </div>

        <div className="dsb-shortcuts">
          {/* PLACEHOLDER: nenhum dos outros existe no Xaphires (sem caixa de
              entrada, sem @menções, sem comentário atribuído, sem reunião,
              sem "minhas tarefas" cruzando quadros, sem mais atalhos atrás
              do "Mais") - ver decisão da conversa. */}
          <ShortcutRow icon={<IconInbox size={15} />} label={t("app.sidebar.shortcuts.inbox")} badge={1} />
          {/* Real: bate-papo da empresa, logo abaixo da Caixa de entrada -
              mesmo gatilho/estado de sempre (useChat), só mudou de casa de
              novo (antes: fileira de utilidades no cabeçalho / flyout do
              "Mais"). O modal em si continua montado só pela TopBar. */}
          <ShortcutRow
            icon={<IconChatBubble size={15} />}
            label={t("chat.title")}
            badge={totalUnread > 0 ? (totalUnread > 9 ? "9+" : totalUnread) : null}
            onClick={openChat}
          />
          <ShortcutRow icon={<IconReply size={15} />} label={t("app.sidebar.shortcuts.replies")} />
          <ShortcutRow icon={<IconAt size={15} />} label={t("app.sidebar.shortcuts.assignedComments")} />
          <ShortcutRow icon={<IconVideo size={15} />} label={t("app.sidebar.shortcuts.meetings")} />
          <ShortcutRow icon={<IconCheckCircle size={15} />} label={t("app.sidebar.shortcuts.myTasks")} />
          <ShortcutRow icon={<IconDots size={15} />} label={t("app.sidebar.rail.more")} />
        </div>

        <div className="dsb-divider" />

        <div className="dsb-spaces">
          <div className="dsb-section-row">
            <span className="dsb-section-title">{t("app.sidebar.spacesTitle")}</span>
            <button type="button" className="dsb-icon-btn" onClick={startAdding} title={t("app.sidebar.newBoard")}>
              <IconPlus size={14} />
            </button>
          </div>

          {/* PLACEHOLDER: não existe uma visão que junte tarefas de todos os
              quadros num só lugar. */}
          <ShortcutRow icon={<IconSparkle size={14} />} label={t("app.sidebar.shortcuts.allTasks")} />

          {renderSpaceGroup("shared", t("app.sidebar.sharedBoards"), sharedBoards, "dsb-swatch-a")}
          {renderSpaceGroup("private", t("app.sidebar.myPrivateBoards"), privateBoards, "dsb-swatch-b")}
          {renderSpaceGroup("sharedWithMe", t("app.sidebar.sharedWithMe"), sharedWithMe, "dsb-swatch-c")}

          {adding ? (
            <div className="dsb-add-form">
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
              <label className="dsb-add-private-toggle">
                <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} />
                <IconLock size={12} />
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
            <button type="button" className="dsb-new-space-btn" onClick={startAdding}>
              <IconPlus size={13} />
              {t("app.sidebar.newBoard")}
            </button>
          )}
        </div>

        <div className="dsb-divider" />

        {/* PLACEHOLDER: Chats com IA e Superagentes não existem no Xaphires -
            ficam só para bater com a referência visual (ver decisão
            registrada na conversa). */}
        <div className="dsb-ai-section">
          <div className="dsb-section-row">
            <span className="dsb-section-title">{t("app.sidebar.aiChatsTitle")}</span>
          </div>
          <ShortcutRow icon={<IconPlus size={14} />} label={t("app.sidebar.aiChatsPlaceholder")} />
        </div>

        <div className="dsb-ai-section">
          <div className="dsb-section-row">
            <span className="dsb-section-title">{t("app.sidebar.superagentsTitle")}</span>
          </div>
          <ShortcutRow icon={<IconBot size={14} />} label={t("app.sidebar.superagentSample1")} />
          <ShortcutRow icon={<IconBot size={14} />} label={t("app.sidebar.superagentSample2")} />
          <button type="button" className="dsb-new-space-btn">
            <IconPlus size={13} />
            {t("app.sidebar.newSuperagent")}
          </button>
        </div>
      </aside>

      {moreOpen &&
        moreCoords &&
        createPortal(
          <div
            className="dropdown dsb-more-dropdown"
            ref={moreMenuRef}
            style={{ position: "fixed", top: moreCoords.top, left: moreCoords.left }}
          >
            <div className="dsb-more-utilities">
              <LanguageSwitcher className="dsb-utility-btn" />
              <ThemeToggle className="dsb-utility-btn" />
            </div>
            {user.platformAdmin && (
              <>
                <div className="dropdown-divider" />
                <div
                  className="dropdown-item"
                  onClick={() => {
                    setPlataformaOpen(true);
                    setMoreOpen(false);
                  }}
                >
                  {t("app.accountMenu.platformPanel")}
                </div>
              </>
            )}
          </div>,
          document.body
        )}

      {usersPanelOpen && <UsersPanel onClose={() => setUsersPanelOpen(false)} />}
      {planOpen && <PlanModal onClose={() => setPlanOpen(false)} />}
      {plataformaOpen && (
        <Suspense fallback={null}>
          <PlataformaModal onClose={() => setPlataformaOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
