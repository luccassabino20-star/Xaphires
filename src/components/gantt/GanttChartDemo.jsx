import GanttChart from "./GanttChart.jsx";
import { useTheme } from "../../state/ThemeContext.jsx";

// Página isolada só para abrir o componente e olhar (rota /gantt-demo em
// main.jsx) - o componente em si (GanttChart) não depende desta página nem de
// nenhum provedor do app além do tema, é o "pronto para integrar" que foi
// pedido. Sem i18n aqui de propósito: o próprio componente ainda não tem
// textos traduzidos (ver comentário em GanttToolbar.jsx).
export default function GanttChartDemo() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="gnt-demo-page">
      <div className="gnt-demo-bar">
        <strong>Gantt component demo</strong>
        <span className="gnt-demo-hint">/gantt-demo - dados de exemplo, não conectado ao app</span>
        <button type="button" className="gnt-demo-theme-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </button>
      </div>
      <GanttChart />
    </div>
  );
}
