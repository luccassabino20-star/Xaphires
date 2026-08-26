import { createContext, useContext, useEffect } from "react";

const ThemeContext = createContext(null);

// A plataforma é só clara (decisão do cliente: sem tema escuro). O provider
// continua existindo só para não precisar tocar nos vários pontos da árvore
// que envolvem a página com <ThemeProvider> (App autenticado, GanttChartDemo,
// as páginas públicas) - ele grava data-theme="light" uma vez e pronto, sem
// estado, sem localStorage, sem opção de trocar. Ver o comentário no topo de
// index.css sobre a remoção dos blocos de tema escuro.
export function ThemeProvider({ children }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
  }, []);
  return <ThemeContext.Provider value={{ theme: "light" }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
