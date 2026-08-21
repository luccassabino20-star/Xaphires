import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AccountMenu from "../../components/AccountMenu.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";
import { parseLocaleFromPath } from "../../i18n/urlLocale.js";
import IresSidebar from "./IresSidebar.jsx";
import FluxoView from "./FluxoView.jsx";
import FluxoCaixaMatrizView from "./FluxoCaixaMatrizView.jsx";
import ExtratoView from "./ExtratoView.jsx";
import ImportarExtratoView from "./ImportarExtratoView.jsx";
import TransacoesTipoView from "./TransacoesTipoView.jsx";
import AnaliseFinanceiraView from "./AnaliseFinanceiraView.jsx";
import CadastrosView from "./CadastrosView.jsx";

// Casca do módulo ERP IRES (id interno "financeiro"): header enxuto (voltar ao
// launcher + logo/nome + conta) e sidebar vertical retrátil à esquerda (ver
// IresSidebar.jsx), com URL de verdade por tela (react-router-dom) - única
// ilha de roteamento do app: o resto navega trocando estado (ver o comentário
// em src/i18n/urlLocale.js sobre por que essa sempre foi a escolha aqui).
// Pedido explícito para esta tela ter link direto/F5 por sub-seção, então a
// exceção é proposital e fica contida a este módulo.
//
// Diferente do Kanban, não há reducer otimista - cada view busca e re-busca por
// conta própria, que é o padrão mais seguro para dado financeiro.

// O basename é o prefixo de idioma da URL atual (ex.: "/en"), se houver -
// mesma extração de main.jsx. Calculado uma vez no mount: trocar de tela
// dentro do Finanças não deveria reprocessar isto a cada render, e o idioma
// não muda sem um F5 (LanguageSwitcher também recarrega a página).
function basenameAtual() {
  const { locale } = parseLocaleFromPath(window.location.pathname);
  return locale ? `/${locale}` : "";
}

export default function FinanceiroModule({ onExit }) {
  const { t } = useTranslation();
  const [sidebarRecolhida, setSidebarRecolhida] = useState(false);
  const [basename] = useState(basenameAtual);

  // PlatformShell normalmente não persiste módulo aberto entre F5 (ver o
  // comentário lá) - aqui é a exceção pedida (URL navegável de verdade), e
  // por isso "voltar ao launcher" precisa limpar a URL na mão: sem isto a
  // pessoa voltaria pro launcher com a barra de endereço ainda em
  // /financas/algo, e um F5 ali reabriria o módulo sozinho.
  function sair() {
    window.history.pushState(null, "", basename || "/");
    onExit();
  }

  return (
    <BrowserRouter basename={basename}>
      <div className="fin">
        <header className="fin-top">
          <div className="fin-top-left">
            <button className="icon-btn" onClick={sair} title={t("modules.backToLauncher")} aria-label={t("modules.backToLauncher")}>
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="currentColor" d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />
              </svg>
            </button>
            <h1 className="fin-title">{t("modules.financeiro.name")}</h1>
          </div>
          <div className="fin-top-actions">
            <LanguageSwitcher />
            <AccountMenu />
          </div>
        </header>

        <div className="fin-shell">
          <IresSidebar collapsed={sidebarRecolhida} onToggleCollapsed={() => setSidebarRecolhida((v) => !v)} />

          <div className="fin-body">
            <Routes>
              <Route path="/financas/resumo" element={<FluxoView />} />
              <Route path="/financas/fluxo-caixa" element={<FluxoCaixaMatrizView />} />
              <Route path="/financas/transacoes/extrato" element={<ExtratoView />} />
              <Route path="/financas/transacoes/extrato/importar" element={<ImportarExtratoView />} />
              <Route path="/financas/transacoes/receitas" element={<TransacoesTipoView tipo="receber" />} />
              <Route path="/financas/transacoes/despesas" element={<TransacoesTipoView tipo="pagar" />} />
              <Route path="/financas/relatorios/analise-despesas" element={<AnaliseFinanceiraView tipo="despesas" />} />
              <Route path="/financas/relatorios/analise-receitas" element={<AnaliseFinanceiraView tipo="receitas" />} />
              <Route path="/financas/configuracoes/categorias" element={<CadastrosView selecionadoInicial="classes" />} />
              <Route path="/financas/configuracoes/contas" element={<CadastrosView selecionadoInicial="contas" />} />
              <Route path="/financas/configuracoes/centros-de-custo" element={<CadastrosView selecionadoInicial="centros" />} />
              <Route path="/financas/configuracoes/outras" element={<CadastrosView selecionadoInicial="impostos" />} />
              <Route path="*" element={<Navigate to="/financas/resumo" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}
