import { useTranslation } from "react-i18next";
import {
  IconNew, IconOpen, IconSave, IconShare, IconUndo, IconPrint,
  IconImportExport, IconSearch, IconZoom, IconSettings, IconHelp, IconContact,
} from "./ganttIcons.jsx";

// Réplica da barra do Tom's Planner. Só "Zoom" tem efeito real (existe grade de
// dias para reduzir/ampliar de verdade); o resto é decorativo de propósito -
// não têm equivalente aqui (não há "arquivo" para abrir/salvar, "compartilhar"
// já é outra tela em quadros de verdade) - ver decisão registrada na conversa.
// onAction(id) fica disponível para quem for integrar isto de verdade depois.
const ACTIONS = [
  { id: "new", icon: IconNew, key: "new" },
  { id: "open", icon: IconOpen, key: "open" },
  { id: "save", icon: IconSave, key: "save" },
  { id: "share", icon: IconShare, key: "share" },
  { id: "undo", icon: IconUndo, key: "undo" },
  { id: "print", icon: IconPrint, key: "print" },
  { id: "import-export", icon: IconImportExport, key: "importExport" },
  { id: "search", icon: IconSearch, key: "search" },
];

const TAIL_ACTIONS = [
  { id: "settings", icon: IconSettings, key: "settings" },
  { id: "help", icon: IconHelp, key: "help" },
  { id: "contact", icon: IconContact, key: "contact" },
];

export default function GanttToolbar({ onAction = () => {}, zoomPct, onZoomIn, onZoomOut, onZoomReset }) {
  const { t } = useTranslation();
  return (
    <div className="gnt-toolbar">
      {ACTIONS.map((a) => (
        <button key={a.id} type="button" className="gnt-toolbar-btn" onClick={() => onAction(a.id)}>
          <a.icon size={15} />
          <span>{t(`gantt.toolbar.${a.key}`)}</span>
        </button>
      ))}

      <div className="gnt-toolbar-zoom">
        <button type="button" className="gnt-toolbar-btn" onClick={onZoomReset} title={t("gantt.toolbar.resetZoom")}>
          <IconZoom size={15} />
          <span>{t("gantt.toolbar.zoom")}</span>
        </button>
        <button type="button" className="gnt-zoom-step" onClick={onZoomOut} aria-label="Zoom out">-</button>
        <span className="gnt-zoom-pct">{zoomPct}%</span>
        <button type="button" className="gnt-zoom-step" onClick={onZoomIn} aria-label="Zoom in">+</button>
      </div>

      <div className="gnt-toolbar-spacer" />

      {TAIL_ACTIONS.map((a) => (
        <button key={a.id} type="button" className="gnt-toolbar-btn" onClick={() => onAction(a.id)}>
          <a.icon size={15} />
          <span>{t(`gantt.toolbar.${a.key}`)}</span>
        </button>
      ))}
    </div>
  );
}
