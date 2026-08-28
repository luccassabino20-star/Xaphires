import { useState } from "react";
import "./xaphiresFinance.css";
import { TRANSACOES, DEFAULT_FORMULAS } from "./financeMockData.js";
import FinanceSidebar, { NAV_ITEMS, CONFIG_ITEM } from "./FinanceSidebar.jsx";
import FinanceCentralExecutiva from "./FinanceCentralExecutiva.jsx";
import FinanceBaseDados from "./FinanceBaseDados.jsx";
import FinanceObrasContas from "./FinanceObrasContas.jsx";
import FinanceFormulasMetricas from "./FinanceFormulasMetricas.jsx";
import FinanceConfiguracoes from "./FinanceConfiguracoes.jsx";

// Módulo "Xaphires Finance & BPO" - pilar registrado de verdade (id
// "finance-bpo" em server/modules.js e src/modules/registry.js, plugado em
// PlatformShell.jsx), lado a lado com "financeiro" (ERP IRES) na mesma aba
// "Financeiro" do launcher de propósito: nasceu para competir com aquele
// módulo e, se o cliente decidir, substituí-lo mais adiante - ver decisão
// registrada na conversa.
//
// Navegação em sidebar interna (ver decisão registrada na conversa - trocou
// as abas horizontais de antes): `transacoes` e `formulas` moram AQUI, não
// em cada tela, porque são os dois estados que precisam atravessar mais de
// uma tela - um lançamento novo em Base de Dados ou uma fórmula alterada em
// Fórmulas & Métricas precisa aparecer na Central Executiva sem precisar de
// "atualizar" manual. `activeView` decide qual tela renderiza; o resto de
// cada tela (filtros de período/banco/centro, formulário aberto ou não)
// continua local a ela mesma - não tem por que subir o que não é
// compartilhado.
//
// Todo dado ainda é simulado (financeMockData.js, gerado na carga, sem
// rede) - o badge "Protótipo · dados simulados" no topo continua de
// propósito. Em especial, a leitura de NF (FinanceUploadPanel.jsx) NÃO faz
// OCR nem parse de XML de verdade - sorteia um documento já pronto. NFSe não
// tem schema nacional único (cada município define o próprio), então mesmo
// a versão "de verdade" deste pilar não dá pra generalizar sem escolher
// integrações município a município ou um serviço de OCR pago - decisão de
// produto que este módulo não toma sozinho.
export default function FinanceModuleLayout({ onExit }) {
  const [activeView, setActiveView] = useState("central");
  // Cópia mutável do array gerado uma vez em financeMockData.js - o módulo
  // inteiro passa a trabalhar em cima desta cópia (adicionar lançamento
  // nunca muta o array original TRANSACOES).
  const [transacoes, setTransacoes] = useState(() => [...TRANSACOES]);
  const [formulas, setFormulas] = useState(DEFAULT_FORMULAS);

  function adicionarLancamento(novo) {
    setTransacoes((prev) => {
      const proximoId = Math.max(0, ...prev.map((t) => t.id)) + 1;
      return [{ id: proximoId, conciliado: false, ...novo }, ...prev];
    });
  }

  const itemAtivo = NAV_ITEMS.find((i) => i.id === activeView) || (activeView === CONFIG_ITEM.id ? CONFIG_ITEM : null);

  return (
    <div className="xf-page">
      <header className="xf-topbar">
        <div className="xf-topbar-title">
          <span className="xf-eyebrow">Xaphires Finance &amp; BPO</span>
          <h1>{itemAtivo?.label || "Central Financeira Executiva"}</h1>
        </div>
        <div className="xf-topbar-actions">
          <span className="xf-badge-sim">Protótipo · dados simulados</span>
          {onExit && (
            <button type="button" className="xf-btn-secondary" onClick={onExit}>
              Sair
            </button>
          )}
        </div>
      </header>

      <div className="xf-shell">
        <FinanceSidebar ativo={activeView} onSelecionar={setActiveView} />
        <main className="xf-content">
          {activeView === "central" && <FinanceCentralExecutiva transacoes={transacoes} formulas={formulas} />}
          {activeView === "basedados" && (
            <FinanceBaseDados
              transacoes={transacoes}
              onAdicionarLancamento={adicionarLancamento}
              regrasCategorizacao={formulas.regrasCategorizacao || []}
            />
          )}
          {activeView === "obras" && <FinanceObrasContas transacoes={transacoes} formulas={formulas} />}
          {activeView === "formulas" && (
            <FinanceFormulasMetricas transacoes={transacoes} formulas={formulas} onAtualizar={setFormulas} />
          )}
          {activeView === CONFIG_ITEM.id && <FinanceConfiguracoes />}
        </main>
      </div>
    </div>
  );
}
