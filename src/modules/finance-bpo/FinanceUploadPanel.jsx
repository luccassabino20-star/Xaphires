import { useRef, useState } from "react";
import { formatBRL } from "./financeMockData.js";

const CAMPOS_ALVO = ["Data", "Descrição", "Valor", "Centro de Custo", "Categoria", "Ignorar coluna"];
const COLUNAS_PLANILHA_EXEMPLO = ["Data Lanc.", "Histórico", "Valor (R$)", "Obra/Unidade", "Tipo"];

// Upload de NF/extrato: drag & drop + parser simulado (ver aviso fixo no
// componente pai - não há OCR/leitor de XML de verdade aqui, é protótipo com
// dado simulado, combinado com o cliente). "Processar" sorteia um documento
// já pronto da lista mockada em vez de ler o arquivo de verdade.
export default function FinanceUploadPanel({ documentosDisponiveis, onSimularLeitura }) {
  const [arrastando, setArrastando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [ultimoLido, setUltimoLido] = useState(null);
  const [modoMapeador, setModoMapeador] = useState(false);
  const [mapeamento, setMapeamento] = useState({});
  const inputRef = useRef(null);

  function simularProcessamento(nomeArquivo) {
    setProcessando(true);
    setUltimoLido(null);
    // Delay só de UX (mostrar o estado "lendo...") - o "resultado" já existe
    // pronto em DOCUMENTOS (financeMockData.js), sorteado aqui.
    window.setTimeout(() => {
      const doc = documentosDisponiveis[Math.floor(Math.random() * documentosDisponiveis.length)];
      setUltimoLido({ ...doc, arquivoOrigem: nomeArquivo });
      setProcessando(false);
      onSimularLeitura?.(doc);
    }, 900);
  }

  function handleDrop(e) {
    e.preventDefault();
    setArrastando(false);
    const arquivo = e.dataTransfer.files?.[0];
    if (!arquivo) return;
    const ehPlanilha = /\.(csv|xlsx?)$/i.test(arquivo.name);
    if (ehPlanilha) {
      setModoMapeador(true);
      return;
    }
    simularProcessamento(arquivo.name);
  }

  function handleInputChange(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    const ehPlanilha = /\.(csv|xlsx?)$/i.test(arquivo.name);
    if (ehPlanilha) {
      setModoMapeador(true);
      return;
    }
    simularProcessamento(arquivo.name);
  }

  return (
    <div className="xf-panel">
      <div className="xf-panel-header">
        <h2>Leitura de Notas &amp; Importação</h2>
        <span className="xf-badge-sim">Simulado</span>
      </div>
      <p className="xf-panel-hint">
        Arraste NFe, NFSe, NFCe (XML/PDF) ou extratos/planilhas (CSV/XLSX). Este protótipo não lê o arquivo de
        verdade — mostra como a extração e o mapeamento vão se comportar quando o parser real entrar.
      </p>

      <div
        className={"xf-dropzone" + (arrastando ? " active" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <svg viewBox="0 0 24 24" width="30" height="30">
          <path
            fill="currentColor"
            d="M12 2 6 8h4v8h4V8h4l-6-6zM4 20h16v2H4z"
          />
        </svg>
        <span className="xf-dropzone-title">Solte o arquivo aqui ou clique para escolher</span>
        <span className="xf-dropzone-sub">NFe · NFSe · NFCe · CSV · XLSX</span>
        <input ref={inputRef} type="file" accept=".xml,.pdf,.csv,.xlsx,.xls" onChange={handleInputChange} style={{ display: "none" }} />
      </div>

      {processando && (
        <div className="xf-processing">
          <span className="xf-processing-dot" />
          Extraindo dados fiscais...
        </div>
      )}

      {ultimoLido && !processando && (
        <div className="xf-parsed-card">
          <div className="xf-parsed-head">
            <span className={"xf-doc-tipo-badge xf-doc-tipo-" + ultimoLido.tipo.toLowerCase()}>{ultimoLido.tipo}</span>
            <span className="xf-parsed-arquivo">{ultimoLido.arquivoOrigem}</span>
          </div>
          <div className="xf-parsed-grid">
            <div>
              <span className="xf-parsed-label">Razão Social</span>
              <span className="xf-parsed-value">{ultimoLido.razaoSocial}</span>
            </div>
            <div>
              <span className="xf-parsed-label">CNPJ</span>
              <span className="xf-parsed-value">{ultimoLido.cnpj}</span>
            </div>
            <div>
              <span className="xf-parsed-label">Vencimento</span>
              <span className="xf-parsed-value">{new Date(ultimoLido.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}</span>
            </div>
            <div>
              <span className="xf-parsed-label">Chave de acesso</span>
              <span className="xf-parsed-value xf-parsed-chave">{ultimoLido.chave}</span>
            </div>
            <div>
              <span className="xf-parsed-label">Valor Bruto</span>
              <span className="xf-parsed-value">{formatBRL(ultimoLido.valorBruto)}</span>
            </div>
            <div>
              <span className="xf-parsed-label">Valor Líquido</span>
              <span className="xf-parsed-value xf-parsed-liquido">{formatBRL(ultimoLido.valorLiquido)}</span>
            </div>
          </div>
          <div className="xf-parsed-impostos">
            <span className="xf-parsed-label">Impostos retidos/faturados</span>
            <div className="xf-parsed-impostos-chips">
              {Object.entries(ultimoLido.impostos)
                .filter(([, v]) => v > 0)
                .map(([nome, valor]) => (
                  <span key={nome} className="xf-imposto-chip">
                    {nome} <strong>{formatBRL(valor)}</strong>
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}

      {modoMapeador && (
        <div className="xf-mapper">
          <div className="xf-panel-header">
            <h3>Mapear colunas da planilha</h3>
            <button type="button" className="xf-link-btn" onClick={() => setModoMapeador(false)}>
              Fechar
            </button>
          </div>
          <p className="xf-panel-hint">Associe cada coluna da sua planilha a um campo do Xaphires Finance.</p>
          <table className="xf-mapper-table">
            <thead>
              <tr>
                <th>Coluna na planilha</th>
                <th>Campo do sistema</th>
              </tr>
            </thead>
            <tbody>
              {COLUNAS_PLANILHA_EXEMPLO.map((coluna) => (
                <tr key={coluna}>
                  <td>{coluna}</td>
                  <td>
                    <select
                      value={mapeamento[coluna] || ""}
                      onChange={(e) => setMapeamento((m) => ({ ...m, [coluna]: e.target.value }))}
                    >
                      <option value="">Selecione...</option>
                      {CAMPOS_ALVO.map((campo) => (
                        <option key={campo} value={campo}>
                          {campo}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="xf-btn-primary" onClick={() => setModoMapeador(false)}>
            Confirmar mapeamento e importar
          </button>
        </div>
      )}
    </div>
  );
}
