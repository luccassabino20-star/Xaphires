import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "kanban-theme";
const ThemeContext = createContext(null);

// Sem escolha salva, o padrão do app é o branco - não "system". Landing e login
// não têm toggle e ignoram esse valor por completo (são sempre brancos, CSS
// próprio em .landing-shell/.auth-shell, sem bloco guardado por data-theme) -
// só o app autenticado (ThemeToggle, na Sidebar) lê e grava aqui.
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
