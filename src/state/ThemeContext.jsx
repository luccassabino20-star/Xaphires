import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "kanban-theme";
const ThemeContext = createContext(null);

// Sem escolha salva, o padrão do site é o branco - não "system". Landing e login
// usam o mesmo ThemeContext (ver LandingThemeToggle), então isto também decide a
// primeira impressão de quem nunca visitou: branco neve, não o dark de marca.
function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* localStorage unavailable */
  }
  return "light";
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme]);

  function setTheme(next) {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable */
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
