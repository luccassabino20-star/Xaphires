import { useTranslation } from "react-i18next";
import { IconNew, IconOpen, IconSave, IconUndo, IconPrint, IconExport, IconSearch, IconZoom } from "./ganttIcons.jsx";

// Cada botão tem efeito real (ver decisão registrada na conversa: Compartilhar,
// Configurações, Ajuda e Contato saíram da barra por não terem equivalente aqui -
// não há "arquivo" para compartilhar nem tela de config/ajuda para este
// componente). "new"/"open"/"save"/"undo" dependem do que quem integra passar
// via onNew/onOpenSelected/onSave (GanttChart); print, export e search são
// genéricos e resolvidos inteiramente dentro do próprio GanttChart.
const ACTIONS = [
  { id: "new", icon: IconNew, key: "new", disabledKey: "hasNew", lockedByReadOnly: true },
  { id: "open", icon: IconOpen, key: "open", disabledKey: "hasSelection" },
  { id: "save", icon: IconSave, key: "save", disabledKey: "dirty", savingKey: true, lockedByReadOnly: true },
  { id: "undo", icon: IconUndo, key: "undo", disabledKey: "dirty", lockedByReadOnly: true },
  { id: "print", icon: IconPrint, key: "print" },
  { id: "export", icon: IconExport, key: "export" },
];

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
  searchOpen,
  readOnly,
}) {
  const { t } = useTranslation();
  return (
    <div className="gnt-toolbar">
      {ACTIONS.map((a) => {
        const disabled =
          (a.lockedByReadOnly && readOnly) ||
          (a.disabledKey === "dirty"
            ? !dirty || saving
            : a.disabledKey === "hasSelection"
            ? !hasSelection
            : a.disabledKey === "hasNew"
            ? !hasNew
            : false);
        const label = a.savingKey && saving ? t("gantt.toolbar.saving") : t(`gantt.toolbar.${a.key}`);
        return (
          <button
            key={a.id}
            type="button"
            className="gnt-toolbar-btn"
            disabled={disabled}
            onClick={() => onAction(a.id)}
          >
            <a.icon size={15} />
            <span>{label}</span>
          </button>
        );
      })}

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
  );
}
