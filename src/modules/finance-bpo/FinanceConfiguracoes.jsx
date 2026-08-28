// Aba "Configurações" - escondida no rodapé da sidebar (ver CONFIG_ITEM em
// FinanceSidebar.jsx), separada das 4 seções principais de propósito: não é
// um pilar do produto, é o guia de referência do construtor de métricas/
// regras, pra consultar depois sem abrir o código (ver formulaEngine.js e
// financeMockData.js, que são a fonte de verdade do que está escrito aqui -
// mudou uma variável ou operador lá, atualize aqui também). Estático, sem
// prop nenhuma: não depende de transações nem de fórmulas do momento.
export default function FinanceConfiguracoes() {
  return (
    <div className="xf-view">
      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Configurações</h2>
        </div>
        <p className="xf-panel-hint">
          Guia de referência do construtor de métricas e regras - sintaxe aceita, variáveis disponíveis e como cada peça se
          conecta ao dashboard.
        </p>
      </div>

      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Variáveis disponíveis</h2>
        </div>
        <p className="xf-panel-hint">Clicáveis no construtor de métricas - cada uma lê o valor já calculado no recorte de banco/centro/período ativo.</p>
        <div className="xf-table-scroll">
          <table className="xf-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>De onde vem</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="xf-guide-token">[Receita Bruta]</td>
                <td>Soma de todas as entradas do recorte filtrado.</td>
              </tr>
              <tr>
                <td className="xf-guide-token">[Lucro Bruto]</td>
                <td>Receita Bruta menos os impostos dos documentos fiscais.</td>
              </tr>
              <tr>
                <td className="xf-guide-token">[Custos Operacionais]</td>
                <td>Saídas que não são "Impostos", excluindo o que estiver desmarcado em Fórmulas de Cálculo.</td>
              </tr>
              <tr>
                <td className="xf-guide-token">[Lucro Líquido]</td>
                <td>Último passo do DRE em cascata - Lucro Bruto menos Custos Operacionais.</td>
              </tr>
              <tr>
                <td className="xf-guide-token">[Impostos Total]</td>
                <td>Soma de ISS + PIS + COFINS + IRRF + CSLL + ICMS dos documentos do recorte.</td>
              </tr>
              <tr>
                <td className="xf-guide-token">[Saldo Bancos]</td>
                <td>Soma dos saldos bancários (ou só o banco selecionado no slicer).</td>
              </tr>
              <tr>
                <td className="xf-guide-token">[Dias do Mês]</td>
                <td>Quantidade de dias do mês corrente - não depende de filtro.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Operadores &amp; funções</h2>
        </div>
        <p className="xf-panel-hint">Precedência matemática padrão - multiplicação e divisão antes de soma e subtração, parênteses primeiro.</p>
        <div className="xf-token-row" style={{ marginBottom: 14 }}>
          {["+", "-", "*", "/", "( )", "SUM(a, b, …)", "AVG(a, b, …)"].map((t) => (
            <span key={t} className="xf-token-btn xf-guide-chip">
              {t}
            </span>
          ))}
        </div>
        <div className="xf-table-scroll">
          <table className="xf-table">
            <thead>
              <tr>
                <th>Função</th>
                <th>Faz</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="xf-guide-token">SUM(a, b, …)</td>
                <td>Soma qualquer lista de expressões separadas por vírgula - números, variáveis ou sub-fórmulas.</td>
              </tr>
              <tr>
                <td className="xf-guide-token">AVG(a, b, …)</td>
                <td>Média da mesma lista - soma dividida pela quantidade de itens.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Formatos de exibição</h2>
        </div>
        <p className="xf-panel-hint">Só muda como o resultado aparece - o cálculo é o mesmo independente do formato escolhido.</p>
        <div className="xf-guide-format-grid">
          <div className="xf-guide-format-card">
            <span className="xf-parsed-label">Moeda (R$)</span>
            <span className="xf-guide-format-sample">R$ 61.275,40</span>
          </div>
          <div className="xf-guide-format-card">
            <span className="xf-parsed-label">Percentual (%)</span>
            <span className="xf-guide-format-sample">61,2%</span>
          </div>
          <div className="xf-guide-format-card">
            <span className="xf-parsed-label">Número Inteiro</span>
            <span className="xf-guide-format-sample">61.275</span>
          </div>
          <div className="xf-guide-format-card">
            <span className="xf-parsed-label">Dias</span>
            <span className="xf-guide-format-sample">30 dias</span>
          </div>
        </div>
      </div>

      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Anatomia de uma fórmula</h2>
        </div>
        <p className="xf-panel-hint">Exemplo testado no construtor - "Margem Líquida Ajustada", formato Percentual.</p>
        <div className="xf-guide-formula-card">
          <div className="xf-guide-formula-line">
            (<span className="xf-guide-var">[Receita Bruta]</span> - <span className="xf-guide-var">[Custos Operacionais]</span>) /{" "}
            <span className="xf-guide-var">[Receita Bruta]</span> * <span className="xf-guide-num">100</span>
          </div>
          <ul className="xf-guide-anno-list">
            <li>
              <span className="xf-guide-mark">( )</span>
              Isola a subtração antes de dividir - sem os parênteses, a divisão aconteceria primeiro.
            </li>
            <li>
              <span className="xf-guide-mark">[ ]</span>
              Cada variável entre colchetes carrega o nome inteiro, espaços incluídos.
            </li>
            <li>
              <span className="xf-guide-mark">* 100</span>
              Converte a proporção em ponto percentual - combina com o formato "Percentual".
            </li>
          </ul>
          <div className="xf-guide-result">
            Com os dados do trimestre atual → <strong>61,2%</strong>
          </div>
        </div>
      </div>

      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Erros de sintaxe</h2>
        </div>
        <p className="xf-panel-hint">O validador roda a cada tecla e recusa a fórmula antes de salvar.</p>
        <div className="xf-table-scroll">
          <table className="xf-table">
            <thead>
              <tr>
                <th>Situação</th>
                <th>Mensagem</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Fórmula vazia</td>
                <td className="xf-guide-token xf-negativo">Digite uma fórmula</td>
              </tr>
              <tr>
                <td>Parêntese sem fechar</td>
                <td className="xf-guide-token xf-negativo">Parêntese "(" sem fechar</td>
              </tr>
              <tr>
                <td>Termina em operador</td>
                <td className="xf-guide-token xf-negativo">Fórmula incompleta</td>
              </tr>
              <tr>
                <td>Variável que não existe</td>
                <td className="xf-guide-token xf-negativo">Variável desconhecida "[Nome]"</td>
              </tr>
              <tr>
                <td>Divisão por zero</td>
                <td className="xf-guide-token xf-negativo">Divisão por zero</td>
              </tr>
              <tr>
                <td>Função sem nome válido</td>
                <td className="xf-guide-token xf-negativo">Função desconhecida - use SUM ou AVG</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Regras de categorização</h2>
        </div>
        <p className="xf-panel-hint">Formato SE / E-OU / ENTÃO - marca lançamentos com um rótulo, visível na coluna "Categoria Automática" de Base de Dados.</p>
        <div className="xf-table-scroll" style={{ marginBottom: 14 }}>
          <table className="xf-table">
            <thead>
              <tr>
                <th>Campo</th>
                <th>Tipo de valor</th>
                <th>Opções</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="xf-guide-token">Centro de Custo</td>
                <td>lista</td>
                <td>Obra X · Obra Y · Matriz · Filial 1</td>
              </tr>
              <tr>
                <td className="xf-guide-token">Banco</td>
                <td>lista</td>
                <td>Itaú · Bradesco · Santander · Nubank · Inter</td>
              </tr>
              <tr>
                <td className="xf-guide-token">Tipo</td>
                <td>lista</td>
                <td>Entrada · Saída</td>
              </tr>
              <tr>
                <td className="xf-guide-token">Categoria</td>
                <td>lista</td>
                <td>Todas as categorias de entrada e saída cadastradas</td>
              </tr>
              <tr>
                <td className="xf-guide-token">Valor</td>
                <td>número</td>
                <td>Comparação numérica livre</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="xf-token-row" style={{ marginBottom: 14 }}>
          {["é igual a", "é diferente de", "é maior que", "é menor que", "é maior ou igual a", "é menor ou igual a"].map((t) => (
            <span key={t} className="xf-token-btn xf-guide-chip">
              {t}
            </span>
          ))}
        </div>

        <div className="xf-guide-rule-card">
          <div className="xf-guide-rule-line">
            <span className="xf-rule-pill">SE</span> Centro de Custo é igual a <strong>Obra X</strong>
            <br />
            <span className="xf-rule-pill">E</span> Valor é maior que <strong>10.000</strong>
            <br />
            <span className="xf-rule-pill">ENTÃO</span> categorizar como <strong>"Alerta de Custo Alto"</strong>
          </div>
          <div className="xf-guide-result">
            Aparece na tabela de lançamentos como <span className="xf-auto-tag">Alerta de Custo Alto</span>
          </div>
        </div>
      </div>

      <div className="xf-panel">
        <div className="xf-panel-header">
          <h2>Cards do dashboard</h2>
        </div>
        <p className="xf-panel-hint">Cada métrica com "Exibir como card KPI" ligado escolhe entre somar um card novo ou substituir um dos 4 fixos da Central Executiva.</p>
        <div className="xf-guide-format-grid">
          {["Receita Bruta", "Lucro Líquido / EBITDA", "Total de Impostos", "Runway"].map((slot) => (
            <div key={slot} className="xf-guide-format-card">
              <span className="xf-parsed-value" style={{ fontSize: 13.5 }}>
                {slot}
              </span>
              <span className="xf-parsed-label" style={{ marginTop: 4 }}>
                substituível
              </span>
            </div>
          ))}
          <div className="xf-guide-format-card" style={{ borderStyle: "dashed" }}>
            <span className="xf-parsed-value" style={{ fontSize: 13.5 }}>
              Card adicional
            </span>
            <span className="xf-parsed-label" style={{ marginTop: 4 }}>
              soma ao final, não troca nenhum
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
