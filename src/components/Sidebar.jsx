import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useBoardDispatch, useBoardState } from "../state/BoardContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { useChat } from "../state/ChatContext.jsx";
import { uid } from "../utils/id.js";
import { isDarkBackground } from "../utils/contrast.js";
import * as api from "../state/api.js";
import UsersPanel from "./UsersPanel.jsx";
import TeamPanel from "./TeamPanel.jsx";
import PlanModal from "./PlanModal.jsx";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import AccountMenu from "./AccountMenu.jsx";
import ArchiveModal from "./ArchiveModal.jsx";
import BottlenecksModal from "./BottlenecksModal.jsx";
import RecurrencesModal from "./RecurrencesModal.jsx";
import MindMapModal from "./MindMapModal.jsx";

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
  return <Svg {...p} d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" />;
}
function IconInbox(p) {
  return <Svg {...p} d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 2v6h4.5a3.5 3.5 0 0 0 7 0H20V6zm0 8v4h16v-4h-3.6a5.5 5.5 0 0 1-8.8 0z" />;
}
function IconVideo(p) {
  return <Svg {...p} d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" />;
}
function IconCheckCircle(p) {
  return <Svg {...p} d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.4-4.2-4.2 1.4-1.4 2.8 2.8 5.8-5.8 1.4 1.4z" />;
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
function IconPalette(p) {
  return (
    <Svg
      {...p}
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2 0-.51-.2-.98-.52-1.32-.3-.32-.48-.76-.48-1.18 0-1.1.9-2 2-2h2.5c2.76 0 5-2.24 5-5C22 6.14 17.5 2 12 2zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
    />
  );
}

// Painel lateral (.dsb-panel, branco por padrão) - ver seção "Personalização
// da barra lateral" em index.css para o restante do sistema. Isolado do fundo
// do quadro (SET_BOARD_BACKGROUND/DataMenu.jsx): estados diferentes,
// persistências diferentes (localStorage aqui, banco lá), só a opção
// "Harmonizar com o Quadro" lê o valor do outro de propósito.
const SIDEBAR_STYLE_STORAGE_KEY = "kanban_sidebar_style";
const DEFAULT_SIDEBAR_STYLE = { mode: "system", color: null };
// Mesmo valor do default de .view-content-area em index.css - repetido aqui
// (não importado dali, é CSS) só para a pré-visualização de "Harmonizar" bater
// com o que a pessoa realmente vê no quadro quando ele não tem cor própria.
const DEFAULT_WORKSPACE_BG = "linear-gradient(180deg, #f8fafc 0%, #f4f5f7 100%)";

function loadSidebarStyle() {
  try {
    const raw = localStorage.getItem(SIDEBAR_STYLE_STORAGE_KEY);
    if (!raw) return DEFAULT_SIDEBAR_STYLE;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.mode !== "string") return DEFAULT_SIDEBAR_STYLE;
    return parsed;
  } catch {
    return DEFAULT_SIDEBAR_STYLE;
  }
}

function resolveHarmonizeBackground(board) {
  return board?.background || DEFAULT_WORKSPACE_BG;
}

const STYLE_MODES = [
  { id: "system", labelKey: "app.sidebar.styleMenu.system", descKey: "app.sidebar.styleMenu.systemDesc" },
  { id: "glass", labelKey: "app.sidebar.styleMenu.glass", descKey: "app.sidebar.styleMenu.glassDesc" },
  { id: "harmonize", labelKey: "app.sidebar.styleMenu.harmonize", descKey: "app.sidebar.styleMenu.harmonizeDesc" },
];

// Nomes fixos (não passam por i18n) - mesmo precedente de BACKGROUND_COLORS/
// BACKGROUND_GRADIENTS em DataMenu.jsx, cujas amostras usam o id cru como
// title. São nomes próprios da paleta da marca, pedidos assim.
const SIDEBAR_PALETTE = [
  { id: "xaphiresPurple", label: "Roxo Xaphires", css: "#6D28D9" },
  { id: "softLilac", label: "Lilás Suave", css: "#EDE9FE" },
  { id: "midnightBlue", label: "Azul Noturno", css: "#0F172A" },
  { id: "graphite", label: "Grafite / Dark Mode", css: "#1E293B" },
  { id: "magentaPink", label: "Rosa / Magenta", css: "#9333EA" },
];
// Uma linha do rail primário. `active`/`onClick` reais quando a seção existe
// de verdade no Xaphires; sem onClick é decoração da referência do ClickUp
// (ver decisão registrada na conversa) - fica no visual, não faz nada.
function RailItem({ icon, label, active, onClick, title }) {
  return (
    <button
      type="button"
      className={"dsb-rail-item" + (active ? " active" : "")}
      onClick={onClick}
      disabled={!onClick}
      title={title}
    >
      <span className="dsb-rail-item-icon">{icon}</span>
      <span className="dsb-rail-item-label">{label}</span>
    </button>
  );
}

// Uma linha de atalho no painel branco (Caixa de entrada, Respostas...) -
// mesmo espírito do RailItem: sem onClick, é só a referência visual.
function ShortcutRow({ icon, label, badge, onClick, title }) {
  return (
    <button type="button" className="dsb-shortcut-row" onClick={onClick} disabled={!onClick} title={title}>
      {/* Só entra o span do ícone quando há ícone - senão o gap da linha
          (dsb-shortcut-row) empurrava o texto mesmo sem nada pra mostrar. */}
      {icon && <span className="dsb-shortcut-icon">{icon}</span>}
      <span className="dsb-shortcut-label">{label}</span>
      {badge != null && <span className="dsb-badge-pink">{badge}</span>}
    </button>
  );
}

export default function Sidebar({ collapsed, activeBoardId, onSelectBoard, onOpenCard, plannerActive, onOpenPlanner, onExitPlanner }) {
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
  // true só quando o painel de usuários abre pelo "Convidar" - decide se ele
  // já nasce com o formulário de novo usuário aberto (ver UsersPanel.jsx).
  const [usersPanelInvite, setUsersPanelInvite] = useState(false);
  const [teamPanelOpen, setTeamPanelOpen] = useState(false);
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

  // Cartões arquivados/Monitor de gargalos/Rotinas automáticas moraram no menu
  // "⋮" do topo do quadro (DataMenu.jsx) antes - agora ficam atrás do "Mais" do
  // rail escuro, junto de idioma/tema (ver moreOpen abaixo). Mesmo quadro ativo
  // que o resto do app usa, e não um novo pedido ao servidor.
  const activeBoard = state.boards.find((b) => b.id === activeBoardId) || null;
  const activeBoardReadOnly = activeBoard?.myRole === "viewer";
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [gargalosOpen, setGargalosOpen] = useState(false);
  const [rotinasOpen, setRotinasOpen] = useState(false);
  const [mapaMentalOpen, setMapaMentalOpen] = useState(false);

  // Personalização isolada do painel lateral - estado próprio (sidebarStyle),
  // persistido no localStorage do navegador, sem relação com board.background
  // (que é por quadro e mora no servidor). "harmonize" é a única ponte
  // deliberada entre os dois: lê o valor do outro sem escrever nele.
  const [sidebarStyle, setSidebarStyle] = useState(loadSidebarStyle);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [styleMenuCoords, setStyleMenuCoords] = useState(null);
  const [customHex, setCustomHex] = useState(
    sidebarStyle.mode === "custom" && sidebarStyle.color ? sidebarStyle.color : "#6D28D9"
  );
  const styleBtnRef = useRef(null);
  const styleMenuRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STYLE_STORAGE_KEY, JSON.stringify(sidebarStyle));
    } catch {
      // Modo privado/quota do navegador: a preferência só não sobrevive ao
      // recarregar, não é motivo pra quebrar a barra lateral.
    }
  }, [sidebarStyle]);

  // Mesmo par posicionamento/clique-fora do flyout "Mais" (moreOpen, acima) -
  // portal em document.body pelo mesmo motivo: .dsb-panel tem overflow-y:auto
  // e um popover relativo ao botão cortaria ao rolar a árvore de quadros.
  useLayoutEffect(() => {
    if (!styleMenuOpen) return;
    const rect = styleBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ESTIMATED_HEIGHT = 420;
    setStyleMenuCoords({
      top: Math.min(rect.bottom + 6, window.innerHeight - ESTIMATED_HEIGHT - 12),
      left: Math.min(rect.left, window.innerWidth - 264 - 12),
    });
  }, [styleMenuOpen]);

  useEffect(() => {
    if (!styleMenuOpen) return;
    function onDocClick(e) {
      if (styleBtnRef.current?.contains(e.target)) return;
      if (styleMenuRef.current?.contains(e.target)) return;
      setStyleMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [styleMenuOpen]);

  function applyStyleMode(mode) {
    setSidebarStyle({ mode, color: null });
  }
  function applyCustomColor(hex) {
    setCustomHex(hex);
    setSidebarStyle({ mode: "custom", color: hex });
  }

  function modePreviewBackground(modeId) {
    if (modeId === "glass") return "linear-gradient(135deg, rgba(255,255,255,0.55), rgba(203,213,225,0.85))";
    if (modeId === "harmonize") return resolveHarmonizeBackground(activeBoard);
    return "#ffffff";
  }

  // Ajuste automático de contraste (item 3 do pedido): "system" é sempre
  // branco/claro, então nunca precisa de texto claro. "glass" também - é
  // translúcido sobre um fundo claro por trás (ver .dsb-panel-glass em
  // index.css), então o texto escuro padrão continua legível. Só
  // "harmonize"/"custom" podem resultar numa cor escura de verdade.
  let panelStyle;
  let panelGlass = false;
  let panelDark = false;
  if (sidebarStyle.mode === "glass") {
    panelGlass = true;
  } else if (sidebarStyle.mode === "harmonize") {
    const bg = resolveHarmonizeBackground(activeBoard);
    panelStyle = { background: bg };
    panelDark = isDarkBackground(bg);
  } else if (sidebarStyle.mode === "custom" && sidebarStyle.color) {
    panelStyle = { background: sidebarStyle.color };
    panelDark = isDarkBackground(sidebarStyle.color);
  }

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
    // 170 bastava só com idioma/tema (e o item de admin, para quem administra a
    // plataforma). Com Monitor de gargalos/Rotinas automáticas/Cartões arquivados
    // somados, o conteúdo real passa disso - a estimativa sobe para cobrir o pior
    // caso (quadro ativo, não leitor, e admin da plataforma) sem medir de verdade.
    const ESTIMATED_HEIGHT = 260;
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
  // (compartilhados / meus privados / compartilhados comigo), reembalado no
  // visual de pasta + lista que a referência usa em vez do cabeçalho de
  // texto que existia antes. Sem o selo colorido com a inicial (pedido do
  // cliente) - só o título.
  function renderSpaceGroup(key, label, boards) {
    if (boards.length === 0 && key !== "shared") return null;
    return (
      <div className="dsb-space-group" key={key}>
        <div className="dsb-space-header">
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
          {/* "Início" volta pro quadro quando o Planejador está ocupando a
              área de conteúdo (ver AuthenticatedApp.jsx) - é o "voltar" da
              página cheia, no lugar do X que o modal tinha. Sem onClick
              quando já está no quadro (nada pra voltar). */}
          <RailItem
            icon={<IconHome />}
            label={t("app.sidebar.rail.home")}
            active={!plannerActive}
            onClick={plannerActive ? onExitPlanner : undefined}
          />
          {/* PLACEHOLDER: IA/Painéis/Quadros/Mais não têm tela nem dado por
              trás no Xaphires hoje - ver decisão registrada na conversa
              ("visual completo, com placeholders"). Ficam sem onClick de
              propósito, com title="Em breve" pra quem passar o mouse não
              achar que é bug. Planejador é real: agenda pessoal (ver
              PersonalPlanner.jsx), fora de qualquer quadro - ocupa a área de
              conteúdo principal como página cheia, não é mais modal. */}
          <RailItem
            icon={<IconCalendar />}
            label={t("app.sidebar.rail.planner")}
            active={plannerActive}
            onClick={() => onOpenPlanner("week")}
          />
          <RailItem icon={<IconSparkle />} label={t("app.sidebar.rail.ai")} title={t("app.sidebar.comingSoon")} />
          <RailItem icon={<IconUsers />} label={t("app.sidebar.rail.team")} onClick={() => setTeamPanelOpen(true)} />
          <RailItem icon={<IconChart />} label={t("app.sidebar.rail.dashboards")} title={t("app.sidebar.comingSoon")} />
          <RailItem icon={<IconGrid />} label={t("app.sidebar.rail.boards")} title={t("app.sidebar.comingSoon")} />
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
          {/* Convite é direto, sem e-mail nem link: só master cria conta
              (mesma regra de sempre, ver Equipes -> Administrar usuários),
              então "convidar" aqui é abrir o painel de usuários com o
              formulário de criação já pronto. Membro comum não tem o que
              fazer aqui, então o botão nasce sem onClick (desabilitado). */}
          <RailItem
            icon={<IconInvite />}
            label={t("app.sidebar.rail.invite")}
            onClick={
              user.role === "master"
                ? () => {
                    setUsersPanelInvite(true);
                    setUsersPanelOpen(true);
                  }
                : undefined
            }
          />
          <button type="button" className="dsb-rail-upgrade" onClick={() => setPlanOpen(true)} title={t("plan.menuItem")}>
            <IconUpgrade size={18} />
          </button>
        </div>
      </nav>

      {/* ---------- Painel secundário (branco por padrão, conteúdo do workspace) ----------
          Cor/estilo isolados do fundo do quadro - ver sidebarStyle acima. */}
      <aside
        className={"dsb-panel" + (panelGlass ? " dsb-panel-glass" : "") + (panelDark ? " dsb-panel-on-dark" : "")}
        style={panelStyle}
      >
        <div className="dsb-panel-header">
          <div className="dsb-panel-header-row">
            {/* Real: nome de quem está logado. Sem seletor de múltiplos
                workspaces no Xaphires (uma empresa por login) - o "v" fica só
                de enfeite, clicar não abre nada (PLACEHOLDER). */}
            <button type="button" className="dsb-workspace-btn" disabled>
              <span className="dsb-workspace-title">{t("app.sidebar.workspaceLabel", { name: user.name })}</span>
              <IconChevronDown size={13} />
            </button>
            <button
              type="button"
              ref={styleBtnRef}
              className={"dsb-icon-btn dsb-style-trigger" + (styleMenuOpen ? " active" : "")}
              onClick={() => setStyleMenuOpen((o) => !o)}
              title={t("app.sidebar.styleMenu.trigger")}
              aria-label={t("app.sidebar.styleMenu.trigger")}
            >
              <IconPalette size={14} />
            </button>
          </div>
        </div>

        <div className="dsb-panel-titlebar">
          <span className="dsb-panel-title">{t("app.sidebar.rail.home")}</span>
          <button type="button" className="dsb-create-btn" onClick={startAdding}>
            <IconPlus size={13} />
            {t("app.sidebar.create")}
          </button>
        </div>

        <div className="dsb-shortcuts">
          {/* Caixa de entrada abre o mesmo chat da empresa (useChat). "Mais" saiu
              daqui: virou redundante depois que Monitor de gargalos/Rotinas
              automáticas/Cartões arquivados foram para o "Mais" do rail escuro,
              que já era funcional (idioma/tema/painel da plataforma). O modal
              do chat continua montado só pela TopBar. */}
          <ShortcutRow
            icon={<IconInbox size={15} />}
            label={t("app.sidebar.shortcuts.inbox")}
            badge={totalUnread > 0 ? (totalUnread > 9 ? "9+" : totalUnread) : null}
            onClick={openChat}
          />
          {/* Real: mesma agenda pessoal do Planejador (PersonalPlanner), aberta
              direto na aba "Reuniões" (type==='event' com vídeochamada) - ver
              PersonalTaskDetailModal.jsx para o campo de link do Zoom/Meet/Teams. */}
          <ShortcutRow
            icon={<IconVideo size={15} />}
            label={t("app.sidebar.shortcuts.meetings")}
            onClick={() => onOpenPlanner("meetings")}
          />
          {/* Real: lista da mesma agenda pessoal do Planejador (PersonalPlanner),
              só que aberta direto na aba de lista em vez da de calendário. */}
          <ShortcutRow
            icon={<IconCheckCircle size={15} />}
            label={t("app.sidebar.shortcuts.myTasks")}
            onClick={() => onOpenPlanner("list")}
          />
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
              quadros num só lugar. Sem ícone de propósito (pedido do
              cliente) - só o texto. */}
          <ShortcutRow label={t("app.sidebar.shortcuts.allTasks")} />

          {renderSpaceGroup("shared", t("app.sidebar.sharedBoards"), sharedBoards)}
          {renderSpaceGroup("private", t("app.sidebar.myPrivateBoards"), privateBoards)}
          {renderSpaceGroup("sharedWithMe", t("app.sidebar.sharedWithMe"), sharedWithMe)}

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
            // Sem ícone de propósito (pedido do cliente) - o "+" já vem no
            // próprio texto (t("app.sidebar.newBoard") = "+ Novo quadro").
            <button type="button" className="dsb-new-space-btn" onClick={startAdding}>
              {t("app.sidebar.newBoard")}
            </button>
          )}
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
            </div>
            <div className="dropdown-divider" />
            <div
              className={"dropdown-item" + (!activeBoard ? " disabled" : "")}
              onClick={() => {
                if (!activeBoard) return;
                setGargalosOpen(true);
                setMoreOpen(false);
              }}
            >
              {t("app.dataMenu.bottlenecks")}
            </div>
            <div
              className={"dropdown-item" + (!activeBoard ? " disabled" : "")}
              onClick={() => {
                if (!activeBoard) return;
                setMapaMentalOpen(true);
                setMoreOpen(false);
              }}
            >
              {t("app.dataMenu.mindMap")}
            </div>
            {!activeBoardReadOnly && (
              <>
                <div
                  className={"dropdown-item" + (!activeBoard ? " disabled" : "")}
                  onClick={() => {
                    if (!activeBoard) return;
                    setRotinasOpen(true);
                    setMoreOpen(false);
                  }}
                >
                  {t("app.dataMenu.recurrences")}
                </div>
                <div
                  className={"dropdown-item" + (!activeBoard ? " disabled" : "")}
                  onClick={() => {
                    if (!activeBoard) return;
                    setArchiveOpen(true);
                    setMoreOpen(false);
                  }}
                >
                  {t("app.dataMenu.archivedCards")}
                </div>
              </>
            )}
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

      {styleMenuOpen &&
        styleMenuCoords &&
        createPortal(
          <div
            className="dropdown dsb-style-menu"
            ref={styleMenuRef}
            style={{ position: "fixed", top: styleMenuCoords.top, left: styleMenuCoords.left }}
          >
            <div className="dsb-style-menu-title">{t("app.sidebar.styleMenu.title")}</div>
            <div className="dsb-style-mode-list">
              {STYLE_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={"dsb-style-mode-btn" + (sidebarStyle.mode === m.id ? " active" : "")}
                  onClick={() => applyStyleMode(m.id)}
                >
                  <span className="dsb-style-mode-swatch" style={{ background: modePreviewBackground(m.id) }} />
                  <span className="dsb-style-mode-text">
                    <span className="dsb-style-mode-label">{t(m.labelKey)}</span>
                    <span className="dsb-style-mode-desc">{t(m.descKey)}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="dropdown-divider" />
            <div className="board-bg-section-label">{t("app.sidebar.styleMenu.paletteTitle")}</div>
            <div className="board-bg-swatch-grid">
              {SIDEBAR_PALETTE.map((c) => (
                <button
                  key={c.id}
                  className={
                    "board-bg-swatch" + (sidebarStyle.mode === "custom" && sidebarStyle.color === c.css ? " active" : "")
                  }
                  style={{ background: c.css }}
                  onClick={() => applyCustomColor(c.css)}
                  title={c.label}
                />
              ))}
            </div>

            <div className="board-bg-section-label">{t("app.sidebar.styleMenu.customTitle")}</div>
            <div className="board-bg-custom-row">
              <input type="color" value={customHex} onChange={(e) => setCustomHex(e.target.value)} />
              <button className="btn-primary btn-small" onClick={() => applyCustomColor(customHex)}>
                {t("app.sidebar.styleMenu.customApply")}
              </button>
            </div>
          </div>,
          document.body
        )}

      {usersPanelOpen && (
        <UsersPanel
          initialShowCreate={usersPanelInvite}
          onClose={() => {
            setUsersPanelOpen(false);
            setUsersPanelInvite(false);
          }}
        />
      )}
      {teamPanelOpen && (
        <TeamPanel
          onClose={() => setTeamPanelOpen(false)}
          onManageUsers={
            user.role === "master"
              ? () => {
                  setTeamPanelOpen(false);
                  setUsersPanelInvite(false);
                  setUsersPanelOpen(true);
                }
              : undefined
          }
        />
      )}
      {planOpen && <PlanModal onClose={() => setPlanOpen(false)} />}
      {plataformaOpen && (
        <Suspense fallback={null}>
          <PlataformaModal onClose={() => setPlataformaOpen(false)} />
        </Suspense>
      )}
      {archiveOpen && activeBoard && <ArchiveModal board={activeBoard} onClose={() => setArchiveOpen(false)} />}
      {gargalosOpen && activeBoard && <BottlenecksModal board={activeBoard} onClose={() => setGargalosOpen(false)} />}
      {rotinasOpen && activeBoard && <RecurrencesModal board={activeBoard} onClose={() => setRotinasOpen(false)} />}
      {mapaMentalOpen && activeBoard && (
        <MindMapModal board={activeBoard} onClose={() => setMapaMentalOpen(false)} onOpenCard={onOpenCard} />
      )}
    </div>
  );
}
