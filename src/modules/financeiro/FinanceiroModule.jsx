import { useState } from "react";
import { useTranslation } from "react-i18next";
import AccountMenu from "../../components/AccountMenu.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";
import LancamentosView from "./LancamentosView.jsx";
import TitulosView from "./TitulosView.jsx";
import MovimentacaoView from "./MovimentacaoView.jsx";
import FluxoView from "./FluxoView.jsx";
import DREView from "./DREView.jsx";
import ContasView from "./ContasView.jsx";
import ImportarExtratoView from "./ImportarExtratoView.jsx";
import CadastrosView from "./CadastrosView.jsx";

// Casca do módulo Financeiro: cabeçalho próprio (voltar ao launcher + conta) e as
// abas. Diferente do Kanban, não há reducer otimista - cada view busca e re-busca
// por conta própria, que é o padrão mais seguro para dado financeiro.
// Lançamentos (só o formulário de lançar), Títulos (a lista e a busca do que já
// existe) e Movimentação (baixa/estorna) são abas separadas de propósito -
// lançar, consultar e mover o dinheiro são passos diferentes, cada um com sua
// tela.
const ABAS = ["lancamentos", "titulos", "movimentacao", "contas", "importar", "fluxo", "dre", "cadastros"];

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
          <button key={a} className={"fin-tab" + (aba === a ? " active" : "")} onClick={() => setAba(a)}>
            {t(`financeiro.tabs.${a}`)}
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
        {aba === "dre" && <DREView />}
        {aba === "cadastros" && <CadastrosView />}
      </div>
    </div>
  );
}
