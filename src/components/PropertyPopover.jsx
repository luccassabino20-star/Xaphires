import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Substitui Radix UI Popover (não instalado neste projeto - zero libs de UI ou
// animação, ver CLAUDE.md e o CSS único em index.css) por um popover simples:
// posiciona pelo getBoundingClientRect() do próprio gatilho, fecha em clique
// fora, Escape ou scroll do corpo do modal. Não reposiciona ao vivo durante o
// scroll - fechar é mais barato que acompanhar, e é sempre uma ação rápida,
// ninguém precisa dele aberto enquanto rola a página.
export default function PropertyPopover({ anchorEl, open, onClose, align = "left", children }) {
  const popRef = useRef(null);
  const [coords, setCoords] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setCoords(null);
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 8,
      left: align === "right" ? null : rect.left,
      right: align === "right" ? window.innerWidth - rect.right : null,
    });
  }, [open, anchorEl, align]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      if (popRef.current?.contains(e.target) || anchorEl?.contains(e.target)) return;
      // O popover de Datas (CardPropertiesToolbar.jsx) hospeda um <DatePicker>,
      // que abre o próprio calendário via createPortal direto em document.body -
      // fora da árvore DOM deste popover. Sem esta exceção, clicar num dia do
      // calendário contava como "clique fora" no mousedown (que dispara antes
      // do click), fechando este popover - e desmontando o DatePicker - antes
      // do onClick do dia rodar. A data nunca chegava a ser aplicada.
      if (e.target.closest(".datepicker-popover")) return;
      onClose();
    }
    // Capture, e não bubble: precisa fechar só o popover antes do listener de
    // Escape do CardModal (que fecha o modal inteiro) ter a chance de agir.
    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    function onScroll() {
      onClose();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown, true);
    const scrollParent = anchorEl?.closest(".card-detail-main");
    scrollParent?.addEventListener("scroll", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown, true);
      scrollParent?.removeEventListener("scroll", onScroll);
    };
  }, [open, anchorEl, onClose]);

  if (!open || !coords) return null;

  return (
    <div
      ref={popRef}
      className="property-popover"
      style={{ top: coords.top, left: coords.left ?? undefined, right: coords.right ?? undefined }}
    >
      {children}
    </div>
  );
}
