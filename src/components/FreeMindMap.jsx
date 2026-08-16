import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { uid } from "../utils/id.js";

// Mapa mental livre, estilo Miro: tela infinita (pan + zoom no scroll), nó
// arrastável, "+" ao redor do nó selecionado pra ramificar rápido, conexão
// curva que se reajusta sozinha, desfazer/refazer. Tudo em SVG + CSS puro
// (sem lib de diagrama) - ver a conversa: o resto do Xaphires não usa
// TypeScript nem Tailwind, e trazer os dois só pra este componente criaria
// um padrão isolado do resto do projeto.
//
// Sem dado nenhum do quadro (pedido explícito) - o modo "Do quadro" é outro
// componente à parte (MindMapFromBoard, dentro de MindMapModal.jsx). Persiste
// só no localStorage deste navegador, por quadro - não passa por
// BoardContext/sync.js nem pelo servidor. Quem quiser sincronizado entre
// dispositivos/equipe precisa pedir isso como recurso à parte (exigiria
// tabela e rota novas).
const LARGURA_NO = 160;
const ALTURA_NO = 44;
const BASE_W = 1000;
const BASE_H = 640;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.5;
const LIMIAR_ARRASTE = 4; // px na tela, não no espaço do SVG (independe do zoom)
const HISTORICO_MAX = 60;
const GRADE_ESPACO = 26;

function chave(boardId) {
  return `xaphires-freemap-${boardId}`;
}

function carregar(boardId) {
  try {
    const bruto = localStorage.getItem(chave(boardId));
    if (!bruto) return { nos: [], arestas: [] };
    const dados = JSON.parse(bruto);
    return { nos: Array.isArray(dados.nos) ? dados.nos : [], arestas: Array.isArray(dados.arestas) ? dados.arestas : [] };
  } catch {
    return { nos: [], arestas: [] };
  }
}

function viewInicial() {
  return { x: -BASE_W / 2, y: -BASE_H / 2, zoom: 1 };
}

// Curva suave tipo "S" entre dois nós - os pontos de controle ficam a meio
// caminho na horizontal, então a curva sai reta do nó e reajusta sozinha
// (é só função de x1/y1/x2/y2, recalculada a cada render).
function caminhoCurvo(x1, y1, x2, y2) {
  const cx = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

export default function FreeMindMap({ boardId }) {
  const { t } = useTranslation();
  const svgRef = useRef(null);
  const [nos, setNos] = useState(() => carregar(boardId).nos);
  const [arestas, setArestas] = useState(() => carregar(boardId).arestas);
  const [selecionado, setSelecionado] = useState(null);
  const [editando, setEditando] = useState(null);
  const [rascunho, setRascunho] = useState("");
  const [view, setView] = useState(viewInicial);
  const [historico, setHistorico] = useState([]);
  const [futuro, setFuturo] = useState([]);
  const arrastoRef = useRef(null);
  const panRef = useRef(null);

  // Troca de quadro (o modal foi fechado e reaberto noutro) - recarrega do
  // zero em vez de herdar o estado do quadro anterior.
  useEffect(() => {
    const dados = carregar(boardId);
    setNos(dados.nos);
    setArestas(dados.arestas);
    setSelecionado(null);
    setEditando(null);
    setView(viewInicial());
    setHistorico([]);
    setFuturo([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  useEffect(() => {
    try {
      localStorage.setItem(chave(boardId), JSON.stringify({ nos, arestas }));
    } catch {
      /* localStorage cheio/bloqueado - o mapa continua funcionando na sessão, só não persiste */
    }
  }, [boardId, nos, arestas]);

  // Zoom no scroll precisa de listener nativo (não passivo): o onWheel do
  // React é passivo por padrão, e preventDefault ali não impede a página de
  // rolar junto - o mapa "pularia" enquanto dá zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function aoRolar(evt) {
      evt.preventDefault();
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pCursor = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(ctm.inverse());
      const fator = evt.deltaY < 0 ? 1.12 : 1 / 1.12;
      setView((v) => {
        const novoZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * fator));
        const larguraAntiga = BASE_W / v.zoom;
        const alturaAntiga = BASE_H / v.zoom;
        const fracX = (pCursor.x - v.x) / larguraAntiga;
        const fracY = (pCursor.y - v.y) / alturaAntiga;
        const larguraNova = BASE_W / novoZoom;
        const alturaNova = BASE_H / novoZoom;
        return { x: pCursor.x - fracX * larguraNova, y: pCursor.y - fracY * alturaNova, zoom: novoZoom };
      });
    }
    svg.addEventListener("wheel", aoRolar, { passive: false });
    return () => svg.removeEventListener("wheel", aoRolar);
  }, []);

  function pontoSvg(evt) {
    const svg = svgRef.current;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    return new DOMPoint(evt.clientX, evt.clientY).matrixTransform(ctm.inverse());
  }

  // Todo ponto de mutação de conteúdo (criar/mover/editar/excluir/ligar) passa
  // por aqui - é o que alimenta desfazer/refazer. Visão (pan/zoom) fica fora
  // de propósito: desfazer deve voltar o CONTEÚDO, não a câmera.
  function commit(novosNos, novasArestas) {
    setHistorico((h) => [...h, { nos, arestas }].slice(-HISTORICO_MAX));
    setFuturo([]);
    setNos(novosNos);
    setArestas(novasArestas);
  }

  function desfazer() {
    setHistorico((h) => {
      if (h.length === 0) return h;
      const anterior = h[h.length - 1];
      setFuturo((f) => [{ nos, arestas }, ...f].slice(0, HISTORICO_MAX));
      setNos(anterior.nos);
      setArestas(anterior.arestas);
      return h.slice(0, -1);
    });
    setSelecionado(null);
    setEditando(null);
  }

  function refazer() {
    setFuturo((f) => {
      if (f.length === 0) return f;
      const proximo = f[0];
      setHistorico((h) => [...h, { nos, arestas }].slice(-HISTORICO_MAX));
      setNos(proximo.nos);
      setArestas(proximo.arestas);
      return f.slice(1);
    });
    setSelecionado(null);
    setEditando(null);
  }

  function criarNo(evt) {
    if (evt.target !== svgRef.current) return;
    const { x, y } = pontoSvg(evt);
    const id = uid();
    commit([...nos, { id, x, y, texto: "" }], arestas);
    setSelecionado(null);
    setEditando(id);
    setRascunho("");
  }

  function cliqueFundo(evt) {
    if (evt.target === svgRef.current) setSelecionado(null);
  }

  function onCliqueNo(id) {
    if (selecionado && selecionado !== id) {
      const existe = arestas.some((a) => (a.de === selecionado && a.para === id) || (a.de === id && a.para === selecionado));
      const novasArestas = existe
        ? arestas.filter((a) => !((a.de === selecionado && a.para === id) || (a.de === id && a.para === selecionado)))
        : [...arestas, { id: uid(), de: selecionado, para: id }];
      commit(nos, novasArestas);
      setSelecionado(null);
    } else {
      setSelecionado(selecionado === id ? null : id);
    }
  }

  function iniciarArraste(evt, no) {
    evt.stopPropagation();
    const p = pontoSvg(evt);
    arrastoRef.current = {
      id: no.id,
      offsetX: p.x - no.x,
      offsetY: p.y - no.y,
      startClientX: evt.clientX,
      startClientY: evt.clientY,
      moveu: false,
      nosAntes: nos,
      arestasAntes: arestas,
    };
  }

  function iniciarPan(evt) {
    if (evt.target !== svgRef.current) return;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    panRef.current = {
      ctm,
      startClientX: evt.clientX,
      startClientY: evt.clientY,
      startViewX: view.x,
      startViewY: view.y,
      moveu: false,
    };
  }

  function moverSvg(evt) {
    const arr = arrastoRef.current;
    if (arr) {
      if (!arr.moveu) {
        const dist = Math.hypot(evt.clientX - arr.startClientX, evt.clientY - arr.startClientY);
        if (dist < LIMIAR_ARRASTE) return;
        arr.moveu = true;
      }
      const p = pontoSvg(evt);
      const nx = p.x - arr.offsetX;
      const ny = p.y - arr.offsetY;
      setNos((ns) => ns.map((n) => (n.id === arr.id ? { ...n, x: nx, y: ny } : n)));
      return;
    }
    const pan = panRef.current;
    if (pan) {
      if (!pan.moveu) {
        const dist = Math.hypot(evt.clientX - pan.startClientX, evt.clientY - pan.startClientY);
        if (dist < LIMIAR_ARRASTE) return;
        pan.moveu = true;
        setSelecionado(null);
      }
      const inv = pan.ctm.inverse();
      const p0 = new DOMPoint(pan.startClientX, pan.startClientY).matrixTransform(inv);
      const p1 = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(inv);
      setView((v) => ({ ...v, x: pan.startViewX - (p1.x - p0.x), y: pan.startViewY - (p1.y - p0.y) }));
    }
  }

  function soltarSvg() {
    const arr = arrastoRef.current;
    if (arr) {
      arrastoRef.current = null;
      if (arr.moveu) {
        setHistorico((h) => [...h, { nos: arr.nosAntes, arestas: arr.arestasAntes }].slice(-HISTORICO_MAX));
        setFuturo([]);
      } else {
        onCliqueNo(arr.id);
      }
      return;
    }
    panRef.current = null;
  }

  function iniciarEdicao(evt, no) {
    evt.stopPropagation();
    setSelecionado(null);
    setEditando(no.id);
    setRascunho(no.texto);
  }

  function confirmarEdicao() {
    if (!editando) return;
    const texto = rascunho.trim();
    if (texto) {
      commit(nos.map((n) => (n.id === editando ? { ...n, texto } : n)), arestas);
    } else {
      // tópico criado e deixado em branco - descarta em vez de guardar nó vazio
      commit(nos.filter((n) => n.id !== editando), arestas.filter((a) => a.de !== editando && a.para !== editando));
    }
    setEditando(null);
    setRascunho("");
  }

  function excluirNo(id) {
    commit(nos.filter((n) => n.id !== id), arestas.filter((a) => a.de !== id && a.para !== id));
    setSelecionado(null);
  }

  function limparTudo() {
    if (!confirm(t("board.mindMap.clearConfirm"))) return;
    commit([], []);
    setSelecionado(null);
    setEditando(null);
  }

  // "+" ao redor do nó selecionado: cria um filho já ligado, na direção
  // escolhida, e abre pra digitar na hora.
  function criarFilho(pai, direcao) {
    const DIST = 210;
    const deltas = { cima: [0, -DIST], baixo: [0, DIST], esquerda: [-DIST, 0], direita: [DIST, 0] };
    const [dx, dy] = deltas[direcao];
    const id = uid();
    const novoNo = { id, x: pai.x + dx, y: pai.y + dy, texto: "" };
    commit([...nos, novoNo], [...arestas, { id: uid(), de: pai.id, para: id }]);
    setSelecionado(null);
    setEditando(id);
    setRascunho("");
  }

  function centralizar() {
    if (nos.length === 0) {
      setView(viewInicial());
      return;
    }
    const xs = nos.map((n) => n.x);
    const ys = nos.map((n) => n.y);
    const margem = 120;
    const minX = Math.min(...xs) - margem;
    const maxX = Math.max(...xs) + margem;
    const minY = Math.min(...ys) - margem;
    const maxY = Math.max(...ys) + margem;
    const larguraConteudo = Math.max(maxX - minX, 200);
    const alturaConteudo = Math.max(maxY - minY, 200);
    const novoZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(BASE_W / larguraConteudo, BASE_H / alturaConteudo)));
    const centroX = (minX + maxX) / 2;
    const centroY = (minY + maxY) / 2;
    setView({ x: centroX - BASE_W / novoZoom / 2, y: centroY - BASE_H / novoZoom / 2, zoom: novoZoom });
  }

  function botaoZoom(fator) {
    setView((v) => {
      const novoZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * fator));
      const centroX = v.x + BASE_W / v.zoom / 2;
      const centroY = v.y + BASE_H / v.zoom / 2;
      return { x: centroX - BASE_W / novoZoom / 2, y: centroY - BASE_H / novoZoom / 2, zoom: novoZoom };
    });
  }

  const noPorId = useMemo(() => Object.fromEntries(nos.map((n) => [n.id, n])), [nos]);
  const viewBox = `${view.x} ${view.y} ${BASE_W / view.zoom} ${BASE_H / view.zoom}`;
  const noSelecionado = selecionado ? noPorId[selecionado] : null;
  const DIRECOES = [
    { chave: "cima", dx: 0, dy: -ALTURA_NO / 2 - 16 },
    { chave: "direita", dx: LARGURA_NO / 2 + 16, dy: 0 },
    { chave: "baixo", dx: 0, dy: ALTURA_NO / 2 + 16 },
    { chave: "esquerda", dx: -LARGURA_NO / 2 - 16, dy: 0 },
  ];

  return (
    <div className="mindmap-free-wrap">
      <div className="mindmap-free-toolbar">
        <span className="mindmap-free-hint">{t("board.mindMap.freeHint")}</span>
        {nos.length > 0 && (
          <button type="button" className="btn-ghost btn-small" onClick={limparTudo}>
            {t("board.mindMap.clear")}
          </button>
        )}
      </div>

      <div className="mindmap-free-canvas">
        <svg
          ref={svgRef}
          viewBox={viewBox}
          width="100%"
          height="100%"
          className="mindmap-free-svg"
          onDoubleClick={criarNo}
          onClick={cliqueFundo}
          onMouseDown={iniciarPan}
          onMouseMove={moverSvg}
          onMouseUp={soltarSvg}
          onMouseLeave={soltarSvg}
        >
          <defs>
            <pattern id="mmGrade" width={GRADE_ESPACO} height={GRADE_ESPACO} patternUnits="userSpaceOnUse">
              <circle cx={1.4} cy={1.4} r={1.4} fill="var(--border-strong)" />
            </pattern>
          </defs>
          <rect
            x={view.x - 3000}
            y={view.y - 3000}
            width={6000}
            height={6000}
            fill="url(#mmGrade)"
            style={{ pointerEvents: "none" }}
          />

          {arestas.map((a) => {
            const de = noPorId[a.de];
            const para = noPorId[a.para];
            if (!de || !para) return null;
            return (
              <path
                key={a.id}
                d={caminhoCurvo(de.x, de.y, para.x, para.y)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.2}
                opacity={0.55}
              />
            );
          })}

          {nos.map((no) => (
            <g key={no.id}>
              <rect
                x={no.x - LARGURA_NO / 2}
                y={no.y - ALTURA_NO / 2}
                width={LARGURA_NO}
                height={ALTURA_NO}
                rx={14}
                fill={selecionado === no.id ? "var(--accent)" : "var(--bg-card)"}
                stroke="var(--accent)"
                strokeWidth={selecionado === no.id ? 0 : 1.6}
                className="mindmap-free-node"
                onMouseDown={(e) => iniciarArraste(e, no)}
                onDoubleClick={(e) => iniciarEdicao(e, no)}
              />
              {editando === no.id ? (
                <foreignObject x={no.x - LARGURA_NO / 2 + 6} y={no.y - ALTURA_NO / 2 + 6} width={LARGURA_NO - 12} height={ALTURA_NO - 12}>
                  <input
                    autoFocus
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    onBlur={confirmarEdicao}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmarEdicao();
                      if (e.key === "Escape") {
                        setEditando(null);
                        setRascunho("");
                      }
                    }}
                    className="mindmap-node-input"
                  />
                </foreignObject>
              ) : (
                <text
                  x={no.x}
                  y={no.y + 4.5}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={600}
                  fill={selecionado === no.id ? "var(--bg-app)" : "var(--text-primary)"}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {no.texto.length > 22 ? no.texto.slice(0, 21) + "…" : no.texto}
                </text>
              )}
              {selecionado === no.id && (
                <g onClick={() => excluirNo(no.id)} className="mindmap-free-delete">
                  <circle cx={no.x + LARGURA_NO / 2 - 7} cy={no.y - ALTURA_NO / 2 + 7} r={9} fill="var(--danger)" />
                  <text
                    x={no.x + LARGURA_NO / 2 - 7}
                    y={no.y - ALTURA_NO / 2 + 11}
                    textAnchor="middle"
                    fontSize={12}
                    fill="#fff"
                    style={{ pointerEvents: "none" }}
                  >
                    ×
                  </text>
                </g>
              )}
            </g>
          ))}

          {/* "+" nas 4 direções do nó selecionado - cria filho já ligado */}
          {noSelecionado &&
            DIRECOES.map((d) => (
              <g
                key={d.chave}
                className="mindmap-free-add"
                onClick={(e) => {
                  e.stopPropagation();
                  criarFilho(noSelecionado, d.chave);
                }}
              >
                <circle cx={noSelecionado.x + d.dx} cy={noSelecionado.y + d.dy} r={11} fill="var(--bg-card)" stroke="var(--accent)" strokeWidth={1.6} />
                <text
                  x={noSelecionado.x + d.dx}
                  y={noSelecionado.y + d.dy + 4}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={700}
                  fill="var(--accent)"
                  style={{ pointerEvents: "none" }}
                >
                  +
                </text>
              </g>
            ))}
        </svg>

        {/* Painel flutuante de controles - sempre visível, sobre o canvas. */}
        <div className="mindmap-free-controls">
          <button type="button" className="mindmap-free-ctrl-btn" onClick={desfazer} disabled={historico.length === 0} title={t("board.mindMap.undo")}>
            ↶
          </button>
          <button type="button" className="mindmap-free-ctrl-btn" onClick={refazer} disabled={futuro.length === 0} title={t("board.mindMap.redo")}>
            ↷
          </button>
          <span className="mindmap-free-ctrl-sep" />
          <button type="button" className="mindmap-free-ctrl-btn" onClick={() => botaoZoom(1 / 1.2)} title={t("board.mindMap.zoomOut")}>
            −
          </button>
          <button type="button" className="mindmap-free-ctrl-btn mindmap-free-ctrl-zoom" onClick={() => setView(viewInicial())} title={t("board.mindMap.zoomReset")}>
            {Math.round(view.zoom * 100)}%
          </button>
          <button type="button" className="mindmap-free-ctrl-btn" onClick={() => botaoZoom(1.2)} title={t("board.mindMap.zoomIn")}>
            +
          </button>
          <span className="mindmap-free-ctrl-sep" />
          <button type="button" className="mindmap-free-ctrl-btn" onClick={centralizar} title={t("board.mindMap.center")}>
            ⤢
          </button>
        </div>
      </div>
    </div>
  );
}
