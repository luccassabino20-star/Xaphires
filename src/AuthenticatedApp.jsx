import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Sidebar from "./components/Sidebar.jsx";
import TopBar from "./components/TopBar.jsx";
import TaskTicker from "./components/TaskTicker.jsx";
import ViewSwitcher from "./components/ViewSwitcher.jsx";
import BoardView from "./components/BoardView.jsx";
import TableView from "./components/views/TableView.jsx";
import CalendarView from "./components/views/CalendarView.jsx";
import BoardGanttView from "./components/views/BoardGanttView.jsx";
import DashboardView from "./components/views/DashboardView.jsx";
import MapView from "./components/views/MapView.jsx";
import MatrixView from "./components/views/MatrixView.jsx";
import CardModal from "./components/CardModal.jsx";
import { useBoardState } from "./state/BoardContext.jsx";
import { useUsers } from "./state/UsersContext.jsx";
import { useAuth } from "./state/AuthContext.jsx";
import PlanBanner from "./components/PlanBanner.jsx";

// Mesmo conjunto de ids que os `view ===` do render mais abaixo aceitam -
// preferência salva com uma versão antiga do app (ou editada na mão) não vira
// tela em branco por apontar pra uma view que não existe mais.
const VIEWS_VALIDAS = new Set(["board", "table", "calendar", "gantt", "dashboard", "map", "matrix"]);

export default function AuthenticatedApp({ onExitModule }) {
  const { t } = useTranslation();
  const state = useBoardState();
  const { users } = useUsers();
  const { user } = useAuth();
  const [activeBoardId, setActiveBoardId] = useState(null);
  const [activeCardId, setActiveCardId] = useState(null);
  // Intent além do id: a barra de ações rápidas do card ("+" de subtarefa)
  // precisa que o modal já abra com o campo de nova subtarefa focado, sem
  // inventar um segundo jeito de criar subtarefa fora do CardModal.
  const [cardOpenIntent, setCardOpenIntent] = useState(null);
  function openCard(cardId, intent) {
    setActiveCardId(cardId);
    setCardOpenIntent(intent || null);
  }
  const [searchQuery, setSearchQuery] = useState("");
  const [memberFilter, setMemberFilter] = useState(null);
  // No celular o sidebar é um painel sobreposto (ver @media em index.css), e abrir
  // por cima do quadro na primeira visita seria uma surpresa - só em telas largas
  // ele começa aberto, empurrando o layout como sempre foi.
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 720);
  // "Exibição padrão" da Central de Perfil (ProfileHubModal.jsx) - só lida
  // uma vez, no primeiro render: trocar de aba depois é ação da pessoa
  // naquela sessão, não deveria saltar de volta pro padrão salvo.
  const [view, setView] = useState(() => {
    const pref = user?.prefs?.defaultView;
    return pref && VIEWS_VALIDAS.has(pref) ? pref : "board";
  });

  useEffect(() => {
    if (!state.hydrated) return;
    if (!activeBoardId || !state.boards.some((b) => b.id === activeBoardId)) {
      setActiveBoardId(state.boards[0]?.id ?? null);
    }
  }, [state.hydrated, state.boards, activeBoardId]);

  const board = state.boards.find((b) => b.id === activeBoardId) || null;

  function selectBoard(id) {
    setActiveBoardId(id);
    // No overlay do celular, escolher um quadro deixaria o painel em cima dele até
    // o próximo toque no hambúrguer - fecha sozinho, como qualquer menu de navegação.
    if (window.innerWidth <= 720) setSidebarOpen(false);
  }

  if (!state.hydrated) {
    return <div className="app-loading">{t("app.loadingBoards")}</div>;
  }

  const viewProps = { board, users, searchQuery, memberFilter, onOpenCard: openCard };

  return (
    <div className="app-shell">
      <Sidebar collapsed={!sidebarOpen} activeBoardId={activeBoardId} onSelectBoard={selectBoard} onOpenCard={openCard} />
      {/* Some sozinho fora do celular via CSS - no desktop o sidebar empurra o
          layout em vez de sobrepor, e um véu escurecendo o resto não faria sentido. */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <div className="main-area">
        <PlanBanner />
        <TopBar
          board={board}
          onExitModule={onExitModule}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          memberFilter={memberFilter}
          onFilterChange={setMemberFilter}
          onSelectBoard={selectBoard}
        />
        {board && <TaskTicker board={board} onOpenCard={openCard} />}
        {board && <ViewSwitcher view={view} onChange={setView} />}
        {board ? (
          <div className="view-content-area" style={board.background ? { background: board.background } : undefined}>
            {view === "board" && (
              <BoardView board={board} members={users} searchQuery={searchQuery} memberFilter={memberFilter} onOpenCard={openCard} />
            )}
            {view === "table" && <TableView {...viewProps} />}
            {view === "calendar" && <CalendarView {...viewProps} />}
            {view === "gantt" && <BoardGanttView {...viewProps} />}
            {view === "dashboard" && <DashboardView {...viewProps} />}
            {view === "map" && <MapView {...viewProps} />}
            {view === "matrix" && <MatrixView {...viewProps} />}
          </div>
        ) : (
          <div className="empty-state">{t("app.noBoards")}</div>
        )}
      </div>
      {activeCardId && board && board.cards[activeCardId] && (
        // key força remount se activeCardId mudar com o modal já aberto - sem
        // isso o título/descrição (estado local, só inicializado no primeiro
        // mount) ficaria preso no cartão anterior, e o próximo blur gravaria
        // o texto errado em cima do cartão novo.
        <CardModal
          key={activeCardId}
          boardId={board.id}
          cardId={activeCardId}
          initialFocus={cardOpenIntent}
          onClose={() => setActiveCardId(null)}
        />
      )}
    </div>
  );
}
