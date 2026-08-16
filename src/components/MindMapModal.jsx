import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import FreeMindMap from "./FreeMindMap.jsx";

// Paleta cíclica por lista - só pra diferenciar os ramos visualmente, sem
// precisar de uma cor cadastrada por lista (o quadro não tem esse campo).
const CORES = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#8b5cf6", "#14b8a6", "#ef4444"];

const RAIO_LISTA = 220;
const RAIO_CARTAO = 150; // distância ADICIONAL da lista até o cartão
const LARGURA_CENTRO = 200;
const LARGURA_LISTA = 170;
const LARGURA_CARTAO = 150;
const ARCO_MAX = 100; // graus, o quanto os cartões de uma lista podem abrir ao redor dela

function truncar(texto, max) {
  if (!texto) return "";
  return texto.length > max ? texto.slice(0, max - 1) + "…" : texto;
}

function paraXY(cx, cy, raio, grausDeg) {
  const rad = (grausDeg * Math.PI) / 180;
  return { x: cx + raio * Math.cos(rad), y: cy + raio * Math.sin(rad) };
}

// Layout radial puro no cliente: o quadro no centro, uma lista por ramo
// (espaçadas em círculo completo), e os cartões de cada lista abertos em
// leque ao redor do ângulo da própria lista. Determinístico e recalculado a
// cada abertura - não precisa persistir posição de nó em lugar nenhum.
function montarLayout(board) {
  const listas = board.lists || [];
  const cx = 0;
  const cy = 0;
  const nos = { listas: [], cartoes: [] };
  const n = listas.length || 1;

  listas.forEach((lista, i) => {
    const anguloLista = (360 / n) * i - 90; // -90 pra primeira lista nascer no topo
    const pos = paraXY(cx, cy, RAIO_LISTA, anguloLista);
    const cardIds = lista.cardIds || [];
    nos.listas.push({ id: lista.id, title: lista.title, x: pos.x, y: pos.y, angulo: anguloLista, cor: CORES[i % CORES.length], count: cardIds.length });

    const m = cardIds.length;
    if (m === 0) return;
    const arco = Math.min(ARCO_MAX, 18 * m);
    const passo = m > 1 ? arco / (m - 1) : 0;
    cardIds.forEach((cardId, j) => {
      const card = board.cards[cardId];
      if (!card) return;
      const anguloCartao = anguloLista + (j - (m - 1) / 2) * passo;
      const posCartao = paraXY(pos.x, pos.y, RAIO_CARTAO, anguloCartao);
      nos.cartoes.push({ id: cardId, title: card.title, x: posCartao.x, y: posCartao.y, listaX: pos.x, listaY: pos.y, cor: CORES[i % CORES.length], done: !!card.completed });
    });
  });

  return nos;
}

// Modo "Do quadro": só leitura, layout radial derivado dos dados reais
// (listas/cartões) - clicar num cartão abre o CardModal de verdade.
function MindMapFromBoard({ board, zoom, onOpenCard, onClose }) {
  const { t } = useTranslation();
  const layout = useMemo(() => montarLayout(board), [board]);

  // Caixa de visualização: maior raio usado (lista + cartão) mais uma margem
  // pra caber o rótulo e não cortar nó nenhum na borda.
  const raioTotal = RAIO_LISTA + RAIO_CARTAO + 90;
  const viewBox = `${-raioTotal} ${-raioTotal} ${raioTotal * 2} ${raioTotal * 2}`;

  if ((board.lists || []).length === 0) {
    return <p className="bottleneck-empty">{t("board.mindMap.empty")}</p>;
  }

  return (
    <div className="mindmap-canvas">
      <svg viewBox={viewBox} width={raioTotal * 2 * zoom} height={raioTotal * 2 * zoom} style={{ display: "block" }}>
        {/* Galhos: centro -> lista */}
        {layout.listas.map((l) => (
          <line key={"linha-" + l.id} x1={0} y1={0} x2={l.x} y2={l.y} stroke={l.cor} strokeWidth={2} opacity={0.45} />
        ))}
        {/* Galhos: lista -> cartão */}
        {layout.cartoes.map((c) => (
          <line key={"linha-" + c.id} x1={c.listaX} y1={c.listaY} x2={c.x} y2={c.y} stroke={c.cor} strokeWidth={1.2} opacity={0.35} />
        ))}

        {/* Nó central: o quadro */}
        <g>
          <rect x={-LARGURA_CENTRO / 2} y={-19} width={LARGURA_CENTRO} height={38} rx={19} fill="var(--accent)" />
          <text x={0} y={5} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--bg-app)">
            {truncar(board.title, 24)}
          </text>
        </g>

        {/* Nós de lista */}
        {layout.listas.map((l) => (
          <g key={l.id}>
            <rect x={l.x - LARGURA_LISTA / 2} y={l.y - 16} width={LARGURA_LISTA} height={32} rx={16} fill={l.cor} />
            <text x={l.x} y={l.y + 4.5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="#fff">
              {truncar(l.title, 22)}
            </text>
          </g>
        ))}

        {/* Nós de cartão - clicáveis, abrem o CardModal */}
        {layout.cartoes.map((c) => (
          <g
            key={c.id}
            className="mindmap-card-node"
            onClick={() => {
              onOpenCard?.(c.id);
              onClose();
            }}
          >
            <rect
              x={c.x - LARGURA_CARTAO / 2}
              y={c.y - 13}
              width={LARGURA_CARTAO}
              height={26}
              rx={8}
              fill="var(--bg-card)"
              stroke={c.cor}
              strokeWidth={1.4}
              opacity={c.done ? 0.55 : 1}
            />
            <text x={c.x} y={c.y + 4} textAnchor="middle" fontSize={11} fill="var(--text-primary)" textDecoration={c.done ? "line-through" : "none"}>
              {truncar(c.title, 20)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function MindMapModal({ board, onClose, onOpenCard }) {
  const { t } = useTranslation();
  const [modo, setModo] = useState("quadro"); // "quadro" | "livre"
  const [zoom, setZoom] = useState(1);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-wide mindmap-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
        <div className="modal-header">
          <h2 className="mindmap-title">{t("board.mindMap.title")}</h2>
          <div className="mindmap-mode-toggle">
            <button type="button" className={"mindmap-mode-btn" + (modo === "quadro" ? " active" : "")} onClick={() => setModo("quadro")}>
              {t("board.mindMap.modeBoard")}
            </button>
            <button type="button" className={"mindmap-mode-btn" + (modo === "livre" ? " active" : "")} onClick={() => setModo("livre")}>
              {t("board.mindMap.modeFree")}
            </button>
          </div>
          {/* O modo livre tem o próprio painel flutuante de zoom (FreeMindMap) -
              este daqui só controla o modo "Do quadro". */}
          {modo === "quadro" && (
            <div className="mindmap-zoom">
              <button type="button" className="btn-ghost btn-small" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} title={t("board.mindMap.zoomOut")}>−</button>
              <button type="button" className="btn-ghost btn-small" onClick={() => setZoom(1)} title={t("board.mindMap.zoomReset")}>{Math.round(zoom * 100)}%</button>
              <button type="button" className="btn-ghost btn-small" onClick={() => setZoom((z) => Math.min(2, z + 0.15))} title={t("board.mindMap.zoomIn")}>+</button>
            </div>
          )}
        </div>

        <div className={"modal-body mindmap-body" + (modo === "livre" ? " mindmap-body-livre" : "")}>
          {modo === "quadro" ? (
            <MindMapFromBoard board={board} zoom={zoom} onOpenCard={onOpenCard} onClose={onClose} />
          ) : (
            <FreeMindMap boardId={board.id} />
          )}
        </div>
      </div>
    </div>
  );
}
