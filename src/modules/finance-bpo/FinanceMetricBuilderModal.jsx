import { useEffect, useMemo, useRef, useState } from "react";
import { avaliarFormula, formatarValorMetrica, VARIAVEIS_DISPONIVEIS, OPERADORES_RAPIDOS, FUNCOES_RAPIDAS, FORMATOS_METRICA } from "./formulaEngine.js";

// Modal do construtor de métrica customizada ("+ Criar Nova Métrica
// Customizada" em FinanceFormulasMetricas.jsx) - estilo DAX/Power Query:
// botões de campo/operador inserem texto na posição do cursor (não no fim),
// e o validador roda a cada tecla contra formulaEngine.js (parser de
// verdade, não eval - ver o comentário no topo daquele arquivo).
//
// `metrica` null = criando; objeto existente = editando (prefila os campos).
// `valoresVariaveis` vem de montarVariaveisFormula (FinanceFormulasMetricas.jsx),
// os números reais do recorte atual - é o que faz o preview aqui já mostrar
// o valor de verdade, não um placeholder.
export default function FinanceMetricBuilderModal({ metrica, valoresVariaveis, onSalvar, onFechar }) {
  const [nome, setNome] = useState(metrica?.nome || "");
  const [formato, setFormato] = useState(metrica?.formato || "moeda");
  const [expressao, setExpressao] = useState(metrica?.expressao || "");
  const inputRef = useRef(null);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onFechar]);

  const validacao = useMemo(() => avaliarFormula(expressao, valoresVariaveis), [expressao, valoresVariaveis]);

  function inserirNaExpressao(texto) {
    const el = inputRef.current;
    const inicio = el?.selectionStart ?? expressao.length;
    const fim = el?.selectionEnd ?? expressao.length;
    const nova = expressao.slice(0, inicio) + texto + expressao.slice(fim);
    setExpressao(nova);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const posicao = inicio + texto.length;
      el.setSelectionRange(posicao, posicao);
    });
  }

  function salvar() {
    if (!nome.trim() || !validacao.ok) return;
    onSalvar({
      id: metrica?.id || `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      nome: nome.trim(),
      formato,
      expressao,
      exibirCard: metrica?.exibirCard ?? false,
      substituirSlot: metrica?.substituirSlot || "novo",
    });
  }

  return (
    <div className="xf-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="xf-modal" role="dialog" aria-modal="true" aria-label="Construtor de métrica customizada">
        <div className="xf-modal-header">
          <h2>{metrica ? "Editar Métrica Customizada" : "Criar Nova Métrica Customizada"}</h2>
          <button type="button" className="xf-modal-close" onClick={onFechar} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="xf-modal-body">
          <div className="xf-form-grid">
            <label>
              <span>Nome da Métrica</span>
              <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Margem Líquida Ajustada" autoFocus />
            </label>
            <label>
              <span>Formato de Exibição</span>
              <select value={formato} onChange={(e) => setFormato(e.target.value)}>
                {FORMATOS_METRICA.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="xf-token-section">
            <span className="xf-token-label">Campos disponíveis</span>
            <div className="xf-token-row">
              {VARIAVEIS_DISPONIVEIS.map((v) => (
                <button key={v} type="button" className="xf-token-btn xf-token-btn-var" onClick={() => inserirNaExpressao(`[${v}]`)}>
                  [{v}]
                </button>
              ))}
            </div>
          </div>

          <div className="xf-token-section">
            <span className="xf-token-label">Operadores</span>
            <div className="xf-token-row">
              {OPERADORES_RAPIDOS.map((op) => (
                <button key={op} type="button" className="xf-token-btn" onClick={() => inserirNaExpressao(op)}>
                  {op}
                </button>
              ))}
              {FUNCOES_RAPIDAS.map((fn) => (
                <button key={fn} type="button" className="xf-token-btn" onClick={() => inserirNaExpressao(fn)}>
                  {fn.replace("(", "()")}
                </button>
              ))}
            </div>
          </div>

          <label className="xf-formula-input-wrap">
            <span>Fórmula</span>
            <input
              ref={inputRef}
              type="text"
              className="xf-formula-input"
              value={expressao}
              onChange={(e) => setExpressao(e.target.value)}
              placeholder="([Receita Bruta] - [Custos Operacionais]) / [Receita Bruta] * 100"
              spellCheck={false}
            />
          </label>

          <div className={"xf-validator " + (validacao.ok ? "xf-validator-ok" : "xf-validator-erro")}>
            {validacao.ok ? "Fórmula Válida ✅" : `Erro de Sintaxe: ${validacao.erro} ⚠️`}
          </div>

          {validacao.ok && (
            <div className="xf-preview-block">
              <span className="xf-parsed-label">Preview com os dados atuais</span>
              <span className="xf-parsed-value xf-preview-block-valor">{formatarValorMetrica(validacao.valor, formato)}</span>
            </div>
          )}
        </div>

        <div className="xf-modal-footer">
          <button type="button" className="xf-btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="xf-btn-primary" disabled={!nome.trim() || !validacao.ok} onClick={salvar}>
            Salvar Métrica
          </button>
        </div>
      </div>
    </div>
  );
}
