import { useState } from "react";
import { useTranslation } from "react-i18next";
import AccountMenu from "../../components/AccountMenu.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";
import LancamentosView from "./LancamentosView.jsx";
import TitulosView from "./TitulosView.jsx";
import MovimentacaoView from "./MovimentacaoView.jsx";
import FluxoView from "./FluxoView.jsx";
import FluxoCaixaMatrizView from "./FluxoCaixaMatrizView.jsx";
import DREView from "./DREView.jsx";
import ContasView from "./ContasView.jsx";
import ImportarExtratoView from "./ImportarExtratoView.jsx";
import CadastrosView from "./CadastrosView.jsx";

// Casca do módulo ERP IRES (id interno "financeiro"): cabeçalho próprio (voltar
// ao launcher + conta) e as abas. Diferente do Kanban, não há reducer otimista -
// cada view busca e re-busca por conta própria, que é o padrão mais seguro para
// dado financeiro.
// Lançamentos (só o formulário de lançar), Títulos (a lista e a busca do que já
// existe) e Movimentação (baixa/estorna) são abas separadas de propósito -
// lançar, consultar e mover o dinheiro são passos diferentes, cada um com sua
// tela.
//
// Compras & Estoque, Faturamento e Relatórios & BI ENTRAM AQUI DENTRO como abas
// (não são mais cards próprios no launcher - saíram de server/modules.js e do
// registry.js do cliente) - ainda sem tela nenhuma, então nascem `real: false`,
// mesmo tratamento "Em breve" do resto da plataforma (SaudeSidebar.jsx,
// ReportsView.jsx). O rótulo reaproveita o nome que essas três já tinham como
// módulo (`modules.<id>.name`), pra não duplicar texto em dois lugares.
const ABAS = [
  { id: "lancamentos", real: true },
  { id: "titulos", real: true },
  { id: "movimentacao", real: true },
  { id: "contas", real: true },
  { id: "importar", real: true },
  { id: "fluxo", real: true },
  { id: "matriz", real: true },
  { id: "dre", real: true },
  { id: "cadastros", real: true },
  { id: "compras-estoque", real: false, labelKey: "modules.compras-estoque.name" },
  { id: "faturamento", real: false, labelKey: "modules.faturamento.name" },
  { id: "relatorios-bi", real: false, labelKey: "modules.relatorios-bi.name" },
];

export default function FinanceiroModule({ onExit }) {
  const { t } = useTranslation();
  const [aba, setAba] = useState("lancamentos");

  return (
    <div className="fin">
      <header className="fin-top">
        <div className="fin-top-left">
          <button className="icon-btn" onClick={onExit} title={t("modules.backToLauncher")} aria-label={t("modules.backToLauncher")}>
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

      <nav className="fin-tabs">
        {ABAS.map((a) => (
          <button
            key={a.id}
            className={"fin-tab" + (aba === a.id ? " active" : "") + (!a.real ? " disabled" : "")}
            onClick={() => a.real && setAba(a.id)}
            disabled={!a.real}
            title={a.real ? undefined : t("modules.comingSoon")}
          >
            {a.labelKey ? t(a.labelKey) : t(`financeiro.tabs.${a.id}`)}
            {!a.real && <span className="fin-tab-badge">{t("modules.comingSoon")}</span>}
          </button>
        ))}
      </nav>

      <div className="fin-body">
        {aba === "lancamentos" && <LancamentosView />}
        {aba === "titulos" && <TitulosView />}
        {aba === "movimentacao" && <MovimentacaoView />}
        {aba === "contas" && <ContasView />}
        {aba === "importar" && <ImportarExtratoView />}
        {aba === "fluxo" && <FluxoView />}
        {aba === "matriz" && <FluxoCaixaMatrizView />}
        {aba === "dre" && <DREView />}
        {aba === "cadastros" && <CadastrosView />}
      </div>
    </div>
  );
}
