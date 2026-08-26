import GanttChart from "./GanttChart.jsx";

// Página isolada só para abrir o componente e olhar (rota /gantt-demo em
// main.jsx) - o componente em si (GanttChart) não depende desta página nem de
// nenhum provedor do app além do tema, é o "pronto para integrar" que foi
// pedido. Sem i18n aqui de propósito: o próprio componente ainda não tem
// textos traduzidos (ver comentário em GanttToolbar.jsx). Sem botão de tema
// escuro: a plataforma não tem mais essa opção (ver ThemeContext.jsx).
export default function GanttChartDemo() {
  return (
    <div className="gnt-demo-page">
      <div className="gnt-demo-bar">
        <strong>Gantt component demo</strong>
        <span className="gnt-demo-hint">/gantt-demo - dados de exemplo, não conectado ao app</span>
      </div>
      <GanttChart />
    </div>
  );
}
