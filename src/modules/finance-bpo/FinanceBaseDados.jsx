import { useMemo, useState } from "react";
import { BANKS, COST_CENTERS, DOCUMENTOS, CATEGORIAS_ENTRADA, CATEGORIAS_SAIDA, formatBRL, aplicarRegrasCategorizacao } from "./financeMockData.js";
import FinanceUploadPanel from "./FinanceUploadPanel.jsx";
import FinanceReconciliationTable from "./FinanceReconciliationTable.jsx";

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Pilar "Base de Dados" do menu lateral: lançamentos (com formulário de
// adicionar de verdade - onAdicionar sobe pra FinanceModuleLayout, que
// concatena no `transacoes` compartilhado; Central Executiva recalcula
// sozinha pelas dependências de useMemo, sem "atualizar" manual nenhum),
// leitura de NF (upload simulado, ver FinanceUploadPanel.jsx), registro de
// documentos fiscais lidos e conciliação bancária.
export default function FinanceBaseDados({ transacoes, onAdicionarLancamento, regrasCategorizacao }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [rascunho, setRascunho] = useState(() => rascunhoVazio());

  const ultimosLancamentos = useMemo(() => transacoes.slice(0, 40), [transacoes]);
  // Rótulos das regras de categorização (Fórmulas & Métricas) aplicados de
  // verdade sobre os lançamentos - mesma função que alimenta a contagem "N
  // lançamentos correspondem" naquela tela, então as duas nunca discordam.
  const categoriasAuto = useMemo(
    () => aplicarRegrasCategorizacao(ultimosLancamentos, regrasCategorizacao),
    [ultimosLancamentos, regrasCategorizacao]
  );

  function rascunhoVazio() {
    return {
      tipo: "entrada",
      data: hojeCivil(),
      bancoId: BANKS[0].id,
      centroId: COST_CENTERS[0].id,
      categoria: CATEGORIAS_ENTRADA[0],
      valor: "",
    };
  }

  function mudarTipo(tipo) {
    setRascunho((r) => ({ ...r, tipo, categoria: tipo === "entrada" ? CATEGORIAS_ENTRADA[0] : CATEGORIAS_SAIDA[0] }));
  }

  function submeter(e) {
    e.preventDefault();
    const valorNum = Number(rascunho.valor);
    if (!valorNum || valorNum <= 0) return;
    const centro = COST_CENTERS.find((c) => c.id === rascunho.centroId);
    onAdicionarLancamento({
      data: rascunho.data,
      descricao: `${rascunho.categoria} · ${centro?.nome || ""}`,
      bancoId: rascunho.bancoId,
      centroId: rascunho.centroId,
      tipo: rascunho.tipo,
      categoria: rascunho.categoria,
      valor: valorNum,
    });
    setRascunho(rascunhoVazio());
    setMostrarForm(false);
  }

  return (
    <div className="xf-view">
      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Lançamentos</h2>
          <button type="button" className="xf-btn-primary xf-btn-small" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? "Cancelar" : "+ Novo lançamento"}
          </button>
        </div>
        <p className="xf-panel-hint">Entradas e saídas manuais - somam direto no dashboard da Central Executiva.</p>

        {mostrarForm && (
          <form className="xf-lancamento-form" onSubmit={submeter}>
            <div className="xf-pill-group">
              <button
                type="button"
                className={"xf-pill" + (rascunho.tipo === "entrada" ? " active xf-pill-positivo" : "")}
                onClick={() => mudarTipo("entrada")}
              >
                Entrada
              </button>
              <button
                type="button"
                className={"xf-pill" + (rascunho.tipo === "saida" ? " active xf-pill-negativo" : "")}
                onClick={() => mudarTipo("saida")}
              >
                Saída
              </button>
            </div>
            <div className="xf-form-grid">
              <label>
                <span>Data</span>
                <input type="date" value={rascunho.data} onChange={(e) => setRascunho((r) => ({ ...r, data: e.target.value }))} required />
              </label>
              <label>
                <span>Valor (R$)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0,00"
                  value={rascunho.valor}
                  onChange={(e) => setRascunho((r) => ({ ...r, valor: e.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Banco</span>
                <select value={rascunho.bancoId} onChange={(e) => setRascunho((r) => ({ ...r, bancoId: e.target.value }))}>
                  {BANKS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Centro de Custo</span>
                <select value={rascunho.centroId} onChange={(e) => setRascunho((r) => ({ ...r, centroId: e.target.value }))}>
                  {COST_CENTERS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Categoria</span>
                <select value={rascunho.categoria} onChange={(e) => setRascunho((r) => ({ ...r, categoria: e.target.value }))}>
                  {(rascunho.tipo === "entrada" ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" className="xf-btn-primary">
              Adicionar lançamento
            </button>
          </form>
        )}

        <table className="xf-table xf-lancamentos-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Banco</th>
              <th>Categoria Automática</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {ultimosLancamentos.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.data + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                <td>{t.descricao}</td>
                <td>{BANKS.find((b) => b.id === t.bancoId)?.nome}</td>
                <td>
                  {(categoriasAuto.get(t.id) || []).length === 0 ? (
                    <span className="xf-text-muted-inline">—</span>
                  ) : (
                    (categoriasAuto.get(t.id) || []).map((rotulo) => (
                      <span key={rotulo} className="xf-auto-tag">
                        {rotulo}
                      </span>
                    ))
                  )}
                </td>
                <td className={"xf-num" + (t.tipo === "entrada" ? " xf-positivo" : " xf-negativo")}>
                  {t.tipo === "entrada" ? "+" : "-"}
                  {formatBRL(t.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FinanceUploadPanel documentosDisponiveis={DOCUMENTOS} />

      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Registros Fiscais</h2>
        </div>
        <p className="xf-panel-hint">Documentos já lidos (simulado) - NFe, NFSe e NFCe com os dados extraídos.</p>
        <table className="xf-table xf-fiscal-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Nº</th>
              <th>Razão Social</th>
              <th>Vencimento</th>
              <th>Valor Bruto</th>
              <th>Valor Líquido</th>
            </tr>
          </thead>
          <tbody>
            {DOCUMENTOS.map((d) => (
              <tr key={d.id}>
                <td>
                  <span className={"xf-doc-tipo-badge xf-doc-tipo-" + d.tipo.toLowerCase()}>{d.tipo}</span>
                </td>
                <td>{d.numero}</td>
                <td>{d.razaoSocial}</td>
                <td>{new Date(d.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                <td className="xf-num">{formatBRL(d.valorBruto)}</td>
                <td className="xf-num xf-positivo">{formatBRL(d.valorLiquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FinanceReconciliationTable transacoes={transacoes} documentos={DOCUMENTOS} />
    </div>
  );
}
