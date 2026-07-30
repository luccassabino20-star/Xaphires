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

// Toggle de dois estados só (sem "system"): landing e login são sempre dark por
// padrão de marca, e aqui a escolha é só "isso ou o branco neve" — ver o bloco
// ":root[data-theme=light] .landing-shell" em index.css. Usa o mesmo ThemeContext
// do app de propósito: a escolha do visitante já chega pronta se ele criar conta.
export default function LandingThemeToggle({ className }) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      className={"icon-btn" + (className ? " " + className : "")}
      onClick={() => setTheme(isLight ? "dark" : "light")}
      title={t("theme.title")}
      aria-label={t("theme.ariaLabel")}
    >
      {isLight ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
