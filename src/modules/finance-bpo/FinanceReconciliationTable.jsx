import { useState } from "react";
import { formatBRL } from "./financeMockData.js";

// Concilia o lançamento do banco com o documento importado (NF/despesa) que
// tem o candidatoId apontando pra ele - ver DOCUMENTOS em financeMockData.js.
// "Conciliar" só muda estado local (useState de conciliados) - não existe
// persistência, é protótipo.
export default function FinanceReconciliationTable({ transacoes, documentos }) {
  const [expandido, setExpandido] = useState(null);
  const [conciliados, setConciliados] = useState(() => new Set());

  const pendentes = transacoes.filter((t) => !t.conciliado && !conciliados.has(t.id));

  function conciliar(transacaoId) {
    setConciliados((s) => new Set(s).add(transacaoId));
    setExpandido(null);
  }

  return (
    <div className="xf-panel">
      <div className="xf-panel-header">
        <h2>Conciliação Bancária</h2>
        <span className="xf-recon-count">{pendentes.length} pendente(s)</span>
      </div>
      <p className="xf-panel-hint">Clique num lançamento para ver o documento candidato e conciliar com 1 clique.</p>

      <table className="xf-table xf-recon-table">
        <thead>
          <tr>
            <th />
            <th>Data</th>
            <th>Descrição</th>
            <th>Valor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {pendentes.length === 0 && (
            <tr>
              <td colSpan={5} className="xf-empty-row">
                Tudo conciliado por aqui.
              </td>
            </tr>
          )}
          {pendentes.map((t) => {
            const doc = documentos.find((d) => d.candidatoId === t.id);
            const aberto = expandido === t.id;
            return (
              <FragmentRow
                key={t.id}
                transacao={t}
                documento={doc}
                aberto={aberto}
                onToggle={() => setExpandido(aberto ? null : t.id)}
                onConciliar={() => conciliar(t.id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ transacao, documento, aberto, onToggle, onConciliar }) {
  return (
    <>
      <tr className="xf-recon-row" onClick={onToggle}>
        <td className="xf-recon-caret">{aberto ? "▾" : "▸"}</td>
        <td>{new Date(transacao.data + "T00:00:00").toLocaleDateString("pt-BR")}</td>
        <td>{transacao.descricao}</td>
        <td className={"xf-num" + (transacao.tipo === "entrada" ? " xf-positivo" : " xf-negativo")}>
          {transacao.tipo === "entrada" ? "+" : "-"}
          {formatBRL(transacao.valor)}
        </td>
        <td>
          <span className={"xf-status-badge" + (documento ? " xf-status-match" : " xf-status-nomatch")}>
            {documento ? "Candidato encontrado" : "Sem correspondência"}
          </span>
        </td>
      </tr>
      {aberto && (
        <tr className="xf-recon-detail-row">
          <td colSpan={5}>
            {documento ? (
              <div className="xf-recon-detail">
                <div>
                  <span className="xf-parsed-label">Documento</span>
                  <span className="xf-parsed-value">
                    {documento.tipo} nº {documento.numero} · {documento.razaoSocial}
                  </span>
                </div>
                <div>
                  <span className="xf-parsed-label">Valor líquido do documento</span>
                  <span className="xf-parsed-value">{formatBRL(documento.valorLiquido)}</span>
                </div>
                <button type="button" className="xf-btn-primary xf-btn-small" onClick={onConciliar}>
                  Conciliar
                </button>
              </div>
            ) : (
              <div className="xf-recon-detail xf-recon-detail-empty">Nenhum documento importado bate com este valor ainda.</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
