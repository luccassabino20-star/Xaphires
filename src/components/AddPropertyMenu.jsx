import { useTranslation } from "react-i18next";
import {
  TagIcon,
  CalendarIcon,
  ChecklistIcon,
  MembersIcon,
  UrgentIcon,
  PinIcon,
  AttachmentFileIcon,
} from "./cardIcons.jsx";

// As 7 propriedades do "+ Adicionar" (CardPropertiesToolbar.jsx). Datas cobre
// início E entrega juntos (um popover só, ver renderDatesPopover na toolbar) -
// só existe devido de sobra porque virou pílula fixa por ser a mais usada.
const ITENS = [
  { key: "labels", Icon: TagIcon },
  { key: "dates", Icon: CalendarIcon },
  { key: "checklist", Icon: ChecklistIcon },
  { key: "members", Icon: MembersIcon },
  { key: "priority", Icon: UrgentIcon },
  { key: "location", Icon: PinIcon },
  { key: "attachments", Icon: AttachmentFileIcon },
];

export default function AddPropertyMenu({ onSelect }) {
  const { t } = useTranslation();
  return (
    <div className="add-property-menu">
      {ITENS.map(({ key, Icon }) => (
        <button key={key} type="button" className="add-property-menu-item" onClick={() => onSelect(key)}>
          <span className="add-property-menu-icon">
            <Icon />
          </span>
          <span className="add-property-menu-text">
            <span className="add-property-menu-title">{t(`board.cardModal.propertiesToolbar.menu.${key}.title`)}</span>
            <span className="add-property-menu-description">{t(`board.cardModal.propertiesToolbar.menu.${key}.description`)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
