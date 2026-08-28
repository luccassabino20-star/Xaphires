import { useMemo, useState } from "react";
import { CAMPOS_REGRA, OPERADORES_REGRA, aplicarRegrasCategorizacao } from "./financeMockData.js";

function condicaoVazia() {
  const primeiro = CAMPOS_REGRA[0];
  return { campo: primeiro.id, operador: "==", valor: primeiro.tipo === "lista" ? primeiro.opcoes[0].id : "" };
}
function rascunhoVazio() {
  return { ...condicaoVazia(), logica: "E", campo2: "", operador2: "==", valor2: "", resultado: "" };
}

// Coluna calculada estilo Power Query: "SE <campo> <operador> <valor> [E/OU
// <campo2> <operador2> <valor2>] ENTÃO categorizar como <resultado>". Regras
// vivem em formulas.regrasCategorizacao (lifted em FinanceModuleLayout, ver
// aplicarRegrasCategorizacao em financeMockData.js) e são aplicadas de
// verdade sobre `transacoes` - a contagem de correspondências aqui usa a
// MESMA função que FinanceBaseDados.jsx usa pra colorir a tabela de
// lançamentos, então "3 lançamentos correspondem" nunca diverge do que
// aparece marcado lá.
export default function FinanceCategorizationRules({ transacoes, regras, onAtualizar }) {
  const [rascunho, setRascunho] = useState(null); // null = form fechado; objeto = editando/criando

  const matches = useMemo(() => aplicarRegrasCategorizacao(transacoes, regras), [transacoes, regras]);
  const contagemPorRegra = useMemo(() => {
    const mapa = new Map(regras.map((r) => [r.id, 0]));
    matches.forEach((rotulos) => {
      rotulos.forEach((rot) => {
        const regra = regras.find((r) => r.resultado === rot);
        if (regra) mapa.set(regra.id, (mapa.get(regra.id) || 0) + 1);
      });
    });
    return mapa;
  }, [matches, regras]);

  function campoInfo(id) {
    return CAMPOS_REGRA.find((c) => c.id === id) || CAMPOS_REGRA[0];
  }

  function abrirNova() {
    setRascunho(rascunhoVazio());
  }
  function editar(regra) {
    setRascunho({ ...regra, campo2: regra.campo2 || "", operador2: regra.operador2 || "==", valor2: regra.valor2 || "" });
  }
  function excluir(id) {
    onAtualizar(regras.filter((r) => r.id !== id));
  }
  function salvarRascunho() {
    if (!rascunho.resultado.trim()) return;
    const limpo = { ...rascunho, resultado: rascunho.resultado.trim() };
    if (!limpo.campo2) {
      delete limpo.campo2;
      delete limpo.operador2;
      delete limpo.valor2;
    }
    const existe = regras.some((r) => r.id === limpo.id);
    onAtualizar(existe ? regras.map((r) => (r.id === limpo.id ? limpo : r)) : [...regras, { ...limpo, id: `r-${Date.now()}` }]);
    setRascunho(null);
  }

  function ValorInput({ campoId, valor, onChange }) {
    const info = campoInfo(campoId);
    if (info.tipo === "lista") {
      return (
        <select value={valor} onChange={(e) => onChange(e.target.value)}>
          {info.opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return <input type="number" step="0.01" value={valor} onChange={(e) => onChange(e.target.value)} placeholder="0,00" />;
  }

  return (
    <div className="xf-panel">
      <div className="xf-panel-header">
        <h2>Regras de Categorização Automática</h2>
        {!rascunho && (
          <button type="button" className="xf-btn-primary xf-btn-small" onClick={abrirNova}>
            + Nova Regra
          </button>
        )}
      </div>
      <p className="xf-panel-hint">
        SE uma condição bater (ou duas, combinadas com E/OU) ENTÃO todo lançamento é marcado com o rótulo escolhido - visível na
        coluna "Categoria Automática" de Base de Dados.
      </p>

      {rascunho && (
        <div className="xf-rule-form">
          <div className="xf-rule-row">
            <span className="xf-rule-se">SE</span>
            <select value={rascunho.campo} onChange={(e) => setRascunho((r) => ({ ...r, campo: e.target.value, valor: campoInfo(e.target.value).tipo === "lista" ? campoInfo(e.target.value).opcoes[0].id : "" }))}>
              {CAMPOS_REGRA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select value={rascunho.operador} onChange={(e) => setRascunho((r) => ({ ...r, operador: e.target.value }))}>
              {OPERADORES_REGRA.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <ValorInput campoId={rascunho.campo} valor={rascunho.valor} onChange={(v) => setRascunho((r) => ({ ...r, valor: v }))} />
          </div>

          <div className="xf-rule-row xf-rule-row-logica">
            <select
              className="xf-rule-logica-select"
              value={rascunho.campo2 ? rascunho.logica : ""}
              onChange={(e) => {
                if (!e.target.value) {
                  setRascunho((r) => ({ ...r, campo2: "" }));
                } else {
                  setRascunho((r) => ({ ...r, logica: e.target.value, campo2: r.campo2 || CAMPOS_REGRA[0].id }));
                }
              }}
            >
              <option value="">+ adicionar segunda condição</option>
              <option value="E">E (as duas precisam bater)</option>
              <option value="OU">OU (basta uma bater)</option>
            </select>
          </div>

          {rascunho.campo2 && (
            <div className="xf-rule-row">
              <span className="xf-rule-se">{rascunho.logica}</span>
              <select value={rascunho.campo2} onChange={(e) => setRascunho((r) => ({ ...r, campo2: e.target.value, valor2: campoInfo(e.target.value).tipo === "lista" ? campoInfo(e.target.value).opcoes[0].id : "" }))}>
                {CAMPOS_REGRA.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select value={rascunho.operador2} onChange={(e) => setRascunho((r) => ({ ...r, operador2: e.target.value }))}>
                {OPERADORES_REGRA.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ValorInput campoId={rascunho.campo2} valor={rascunho.valor2} onChange={(v) => setRascunho((r) => ({ ...r, valor2: v }))} />
            </div>
          )}

          <div className="xf-rule-row">
            <span className="xf-rule-se">ENTÃO categorizar como</span>
            <input
              type="text"
              value={rascunho.resultado}
              onChange={(e) => setRascunho((r) => ({ ...r, resultado: e.target.value }))}
              placeholder='Ex.: "Alerta de Custo Alto"'
              className="xf-rule-resultado-input"
            />
          </div>

          <div className="xf-rule-actions">
            <button type="button" className="xf-btn-secondary xf-btn-small" onClick={() => setRascunho(null)}>
              Cancelar
            </button>
            <button type="button" className="xf-btn-primary xf-btn-small" disabled={!rascunho.resultado.trim()} onClick={salvarRascunho}>
              Salvar Regra
            </button>
          </div>
        </div>
      )}

      {regras.length === 0 && !rascunho ? (
        <div className="xf-empty-row">Nenhuma regra criada ainda.</div>
      ) : (
        <ul className="xf-rules-list">
          {regras.map((r) => (
            <li key={r.id} className="xf-rule-item">
              <div className="xf-rule-item-text">
                <span className="xf-rule-pill">SE</span> {campoInfo(r.campo).label} {OPERADORES_REGRA.find((o) => o.id === r.operador)?.label}{" "}
                <strong>{campoInfo(r.campo).tipo === "lista" ? campoInfo(r.campo).opcoes.find((o) => o.id === r.valor)?.label : r.valor}</strong>
                {r.campo2 && (
                  <>
                    {" "}
                    <span className="xf-rule-pill">{r.logica}</span> {campoInfo(r.campo2).label} {OPERADORES_REGRA.find((o) => o.id === r.operador2)?.label}{" "}
                    <strong>{campoInfo(r.campo2).tipo === "lista" ? campoInfo(r.campo2).opcoes.find((o) => o.id === r.valor2)?.label : r.valor2}</strong>
                  </>
                )}{" "}
                <span className="xf-rule-pill">ENTÃO</span> "{r.resultado}"
              </div>
              <div className="xf-rule-item-side">
                <span className="xf-recon-count">{contagemPorRegra.get(r.id) || 0} lançamentos correspondem</span>
                <button type="button" className="xf-link-btn" onClick={() => editar(r)}>
                  Editar
                </button>
                <button type="button" className="xf-link-btn xf-link-btn-danger" onClick={() => excluir(r.id)}>
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
