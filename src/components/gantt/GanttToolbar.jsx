import { useTranslation } from "react-i18next";
import { IconNew, IconOpen, IconSave, IconUndo, IconPrint, IconExport, IconSearch, IconZoom } from "./ganttIcons.jsx";

// Cada botão tem efeito real (ver decisão registrada na conversa: Compartilhar,
// Configurações, Ajuda e Contato saíram da barra por não terem equivalente aqui -
// não há "arquivo" para compartilhar nem tela de config/ajuda para este
// componente). "new"/"open"/"save"/"undo" dependem do que quem integra passar
// via onNew/onOpenSelected/onSave (GanttChart); print, export e search são
// genéricos e resolvidos inteiramente dentro do próprio GanttChart.
// "new" fica de fora desta lista e renderiza sozinho no fim da barra (ver
// JSX abaixo) - é o único botão "primário" (estilo ClickUp: CTA escuro à
// direita), os demais são ações secundárias em pílula neutra.
const ACTIONS = [
  { id: "open", icon: IconOpen, key: "open", disabledKey: "hasSelection" },
  { id: "save", icon: IconSave, key: "save", disabledKey: "dirty", savingKey: true, lockedByReadOnly: true, highlight: true },
  { id: "undo", icon: IconUndo, key: "undo", disabledKey: "dirty", lockedByReadOnly: true },
  { id: "print", icon: IconPrint, key: "print" },
  { id: "export", icon: IconExport, key: "export" },
];
const NEW_ACTION = { id: "new", icon: IconNew, key: "new", disabledKey: "hasNew", lockedByReadOnly: true };

export default function GanttToolbar({
  onAction = () => {},
  zoomPct,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  dirty,
  saving,
  hasSelection,
  hasNew = true,
  showOpen = true,
  searchOpen,
  readOnly,
}) {
  const { t } = useTranslation();
  // "Abrir" só faz sentido no fluxo peek → selecionar → abrir - quem integra
  // com onTaskClick (ver GanttChart.jsx) já abre o cartão de verdade no
  // clique direto na barra/linha, e aí este botão nunca teria seleção pra
  // usar.
  const actions = showOpen ? ACTIONS : ACTIONS.filter((a) => a.id !== "open");

  function isDisabled(a) {
    return (
      (a.lockedByReadOnly && readOnly) ||
      (a.disabledKey === "dirty"
        ? !dirty || saving
        : a.disabledKey === "hasSelection"
        ? !hasSelection
        : a.disabledKey === "hasNew"
        ? !hasNew
        : false)
    );
  }
  function labelFor(a) {
    return a.savingKey && saving ? t("gantt.toolbar.saving") : t(`gantt.toolbar.${a.key}`);
  }

  return (
    <div className="gnt-toolbar">
      <div className="gnt-toolbar-group">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className={"gnt-toolbar-btn" + (a.highlight && dirty && !isDisabled(a) ? " gnt-toolbar-btn-highlight" : "")}
            disabled={isDisabled(a)}
            onClick={() => onAction(a.id)}
          >
            <a.icon size={15} />
            <span>{labelFor(a)}</span>
          </button>
        ))}

        <button
          type="button"
          className={"gnt-toolbar-btn" + (searchOpen ? " active" : "")}
          onClick={() => onAction("search")}
        >
          <IconSearch size={15} />
          <span>{t("gantt.toolbar.search")}</span>
        </button>

        <div className="gnt-toolbar-zoom">
          <button type="button" className="gnt-toolbar-btn" onClick={onZoomReset} title={t("gantt.toolbar.resetZoom")}>
            <IconZoom size={15} />
            <span>{t("gantt.toolbar.zoom")}</span>
          </button>
          <button type="button" className="gnt-zoom-step" onClick={onZoomOut} aria-label="Zoom out">-</button>
          <span className="gnt-zoom-pct">{zoomPct}%</span>
          <button type="button" className="gnt-zoom-step" onClick={onZoomIn} aria-label="Zoom in">+</button>
        </div>
      </div>

      <button
        type="button"
        className="gnt-toolbar-btn-primary"
        disabled={isDisabled(NEW_ACTION)}
        onClick={() => onAction(NEW_ACTION.id)}
      >
        <IconNew size={14} />
        <span>{labelFor(NEW_ACTION)}</span>
      </button>
    </div>
  );
}
