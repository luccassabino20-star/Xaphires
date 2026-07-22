import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../state/ThemeContext.jsx";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path
        fill="currentColor"
        d="M12 4a1 1 0 0 1-1-1V1a1 1 0 0 1 2 0v2a1 1 0 0 1-1 1zm0 19a1 1 0 0 1-1-1v-2a1 1 0 0 1 2 0v2a1 1 0 0 1-1 1zm9-11a1 1 0 0 1 0 2h-2a1 1 0 0 1 0-2zM6 12a1 1 0 0 1-1 1H3a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1zm12.36-6.36a1 1 0 0 1 0 1.42l-1.42 1.41a1 1 0 1 1-1.41-1.41l1.41-1.42a1 1 0 0 1 1.42 0zM6.46 17.54a1 1 0 0 1 0 1.42L5.05 20.36a1 1 0 1 1-1.41-1.41l1.41-1.41a1 1 0 0 1 1.41 0zm12.9 2.82a1 1 0 0 1-1.41 0l-1.41-1.41a1 1 0 0 1 1.41-1.42l1.41 1.42a1 1 0 0 1 0 1.41zM5.05 3.64a1 1 0 0 1 1.41 0l1.41 1.42A1 1 0 1 1 6.46 6.46L5.05 5.05a1 1 0 0 1 0-1.41zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"
      />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path fill="currentColor" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path fill="currentColor" d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-6l1 3h1v2H8v-2h1l1-3H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v9h14V6z" />
    </svg>
  );
}
const ICONS = { light: SunIcon, dark: MoonIcon, system: SystemIcon };

export default function ThemeToggle({ className }) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const Icon = ICONS[theme] || SystemIcon;
  const OPTIONS = [
    { id: "light", label: t("theme.light") },
    { id: "dark", label: t("theme.dark") },
    { id: "system", label: t("theme.system") },
  ];

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className={"theme-toggle" + (className ? " " + className : "")}>
      <button ref={btnRef} className="icon-btn" onClick={() => setOpen((o) => !o)} title={t("theme.title")} aria-label={t("theme.ariaLabel")}>
        <Icon />
      </button>
      {open && (
        <div className="dropdown theme-dropdown" ref={ref}>
          {OPTIONS.map((opt) => {
            const OptIcon = ICONS[opt.id];
            return (
              <div
                key={opt.id}
                className={"dropdown-item" + (theme === opt.id ? " active" : "")}
                onClick={() => {
                  setTheme(opt.id);
                  setOpen(false);
                }}
              >
                <OptIcon />
                <span>{opt.label}</span>
                {theme === opt.id && <span className="theme-check">✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
