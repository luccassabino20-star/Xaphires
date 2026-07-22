import { useTranslation } from "react-i18next";

const VIEW_IDS = ["board", "table", "calendar", "timeline", "dashboard", "map", "matrix"];

export default function ViewSwitcher({ view, onChange }) {
  const { t } = useTranslation();
  return (
    <nav className="view-tabs">
      {VIEW_IDS.map((id) => (
        <button key={id} className={"view-tab" + (view === id ? " active" : "")} onClick={() => onChange(id)}>
          {t(`views.switcher.${id}`)}
        </button>
      ))}
    </nav>
  );
}
