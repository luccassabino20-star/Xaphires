import { useState } from "react";
import { useTranslation } from "react-i18next";
import AccountMenu from "../../components/AccountMenu.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";
import ModuleIcon from "../ModuleIcon.jsx";
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
// registry.js do cliente) - ainda sem tela nenhuma, então nascem `real: false`.
// Diferente do badge "Em breve" travado do resto da plataforma (SaudeSidebar.jsx,
// ReportsView.jsx), aqui a aba É clicável: abre o painel AbaEmBreve (ícone, nome
// e descrição - reaproveita modules.<id>.name/.desc, o mesmo texto que a aba
// tinha como card no launcher, pra não duplicar em dois lugares).
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
  { id: "compras-estoque", real: false, icon: "estoque", labelKey: "modules.compras-estoque.name", descKey: "modules.compras-estoque.desc" },
  { id: "faturamento", real: false, icon: "faturamento", labelKey: "modules.faturamento.name", descKey: "modules.faturamento.desc" },
  { id: "relatorios-bi", real: false, icon: "bi", labelKey: "modules.relatorios-bi.name", descKey: "modules.relatorios-bi.desc" },
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
            onClick={() => setAba(a.id)}
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
        {(() => {
          const pendente = ABAS.find((a) => a.id === aba && !a.real);
          return pendente && <AbaEmBreve aba={pendente} />;
        })()}
      </div>
    </div>
  );
}

// Painel das abas "Em breve" (Compras & Estoque, Faturamento, Relatórios & BI) -
// clicável, ao contrário de um item de menu travado: mostra ícone, nome e a
// mesma descrição que a aba tinha como card no launcher (modules.<id>.desc),
// pra quem clica entender o que está por vir, não só ver que não dá pra entrar.
function AbaEmBreve({ aba }) {
  const { t } = useTranslation();
  return (
    <div className="fin-em-breve">
      <span className="fin-em-breve-icone"><ModuleIcon name={aba.icon} size={32} /></span>
      <h2 className="fin-em-breve-titulo">{t(aba.labelKey)}</h2>
      <p className="fin-em-breve-desc">{t(aba.descKey)}</p>
      <span className="fin-tab-badge">{t("modules.comingSoon")}</span>
    </div>
  );
}
