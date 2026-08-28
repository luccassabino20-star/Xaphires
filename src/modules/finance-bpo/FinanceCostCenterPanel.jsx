import { formatBRL, formatBRLShort, DEFAULT_FORMULAS } from "./financeMockData.js";

// DRE por Centro de Custo/Obra - clicar numa linha destaca localmente (ver
// FinanceObrasContas.jsx pro porquê de não filtrar as outras telas).
// metaPct vem de formulas.margemMetaPct (Fórmulas & Métricas) - o selo de
// margem compara contra a meta, não só contra zero, então uma obra
// "lucrando pouco" também aparece em vermelho, não só a que dá prejuízo.
export default function FinanceCostCenterPanel({ resumo, centroSelecionado, onSelecionarCentro, metaPct = DEFAULT_FORMULAS.margemMetaPct }) {
  const maiorEntrada = Math.max(1, ...resumo.map((c) => c.entradas));

  return (
    <div className="xf-panel">
      <div className="xf-panel-header">
        <h2>Centro de Custo / Obras</h2>
        {centroSelecionado && (
          <button type="button" className="xf-link-btn" onClick={() => onSelecionarCentro(null)}>
            Limpar filtro
          </button>
        )}
      </div>
      <p className="xf-panel-hint">
        Selo de margem compara contra a meta ({metaPct}%, editável em Fórmulas &amp; Métricas), não só contra zero.
      </p>

      <div className="xf-costcenter-grid">
        <table className="xf-table xf-costcenter-table">
          <thead>
            <tr>
              <th>Centro de Custo</th>
              <th>Receita Bruta</th>
              <th>Despesas</th>
              <th>Resultado</th>
              <th>Margem</th>
            </tr>
          </thead>
          <tbody>
            {resumo.map((c) => {
              const ativo = centroSelecionado === c.id;
              const positivo = c.resultado >= 0;
              const acimaDaMeta = c.margem >= metaPct;
              return (
                <tr
                  key={c.id}
                  className={"xf-costcenter-row" + (ativo ? " active" : "")}
                  onClick={() => onSelecionarCentro(ativo ? null : c.id)}
                >
                  <td>
                    <span className="xf-costcenter-nome">{c.nome}</span>
                    <span className="xf-costcenter-tipo">{c.tipo}</span>
                  </td>
                  <td className="xf-num xf-positivo">{formatBRL(c.entradas)}</td>
                  <td className="xf-num xf-negativo">{formatBRL(c.saidas)}</td>
                  <td className={"xf-num" + (positivo ? " xf-positivo" : " xf-negativo")}>
                    {positivo ? "+" : ""}
                    {formatBRL(c.resultado)}
                  </td>
                  <td className="xf-num">
                    <span className={"xf-margin-badge" + (acimaDaMeta ? " xf-positivo" : " xf-negativo")} title={`Meta: ${metaPct}%`}>
                      {c.margem.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="xf-costcenter-bars">
          {resumo.map((c) => (
            <div key={c.id} className="xf-costcenter-bar-row">
              <span className="xf-costcenter-bar-label">{c.nome}</span>
              <div className="xf-costcenter-bar-track">
                <div className="xf-costcenter-bar xf-positivo-bg" style={{ width: `${(c.entradas / maiorEntrada) * 100}%` }} />
                <div className="xf-costcenter-bar xf-negativo-bg" style={{ width: `${(c.saidas / maiorEntrada) * 100}%` }} />
              </div>
              <span className="xf-costcenter-bar-value">{formatBRLShort(c.resultado)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
