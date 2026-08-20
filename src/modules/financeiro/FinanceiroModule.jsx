import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
// Clicar numa delas NÃO navega (não troca `aba`, não mexe no que está aberto no
// corpo) - abre um popover ancorado na própria aba (ícone, nome e a descrição
// que ela tinha como card no launcher, reaproveitando modules.<id>.desc), como
// uma prévia rápida em vez de uma tela cheia pra algo que ainda não existe.
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

// Largura fixa do popover (bate com .fin-em-breve-popover em index.css) - usada
// pra calcular a posição sem esperar um segundo render medindo o próprio DOM.
const POPOVER_LARGURA = 300;

export default function FinanceiroModule({ onExit }) {
  const { t } = useTranslation();
  const [aba, setAba] = useState("lancamentos");
  const [popoverId, setPopoverId] = useState(null);
  const [popoverPos, setPopoverPos] = useState(null); // { top, left, caretLeft }
  // A aba clicada mora dentro de .fin-tabs, que tem overflow-x:auto - e por
  // regra do CSS (overflow num eixo força o outro a deixar de ser "visible"),
  // qualquer coisa position:absolute que vazasse pra fora da barra ficaria
  // CORTADA verticalmente. Só apareceu isso testando no navegador (mesma
  // armadilha que o CLAUDE.md descreve para CSS em geral) - por isso o popover
  // vai por createPortal pra document.body, com position:fixed calculada a
  // partir do retângulo real da aba (getBoundingClientRect), em vez de
  // position:absolute dentro da barra.
  const triggerRef = useRef(null); // wrap da aba aberta (o botão)
  const popoverRef = useRef(null); // o próprio popover, portalado

  useEffect(() => {
    if (!popoverId) return;
    function handleClick(e) {
      const dentroDaAba = triggerRef.current && triggerRef.current.contains(e.target);
      const dentroDoPopover = popoverRef.current && popoverRef.current.contains(e.target);
      if (!dentroDaAba && !dentroDoPopover) setPopoverId(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popoverId]);

  function alternarPopover(a, e) {
    if (popoverId === a.id) {
      setPopoverId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - POPOVER_LARGURA - 16);
    setPopoverPos({ top: rect.bottom + 10, left, caretLeft: rect.left + rect.width / 2 - left - 6 });
    setPopoverId(a.id);
  }

  const abaPopover = ABAS.find((a) => a.id === popoverId);

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
          <div key={a.id} className="fin-tab-wrap" ref={popoverId === a.id ? triggerRef : null}>
            <button
              className={"fin-tab" + (aba === a.id || popoverId === a.id ? " active" : "") + (!a.real ? " disabled" : "")}
              onClick={(e) => (a.real ? setAba(a.id) : alternarPopover(a, e))}
            >
              {a.labelKey ? t(a.labelKey) : t(`financeiro.tabs.${a.id}`)}
              {!a.real && <span className="fin-tab-badge">{t("modules.comingSoon")}</span>}
            </button>
          </div>
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

      {abaPopover &&
        popoverPos &&
        createPortal(<AbaEmBrevePopover aba={abaPopover} pos={popoverPos} contentRef={popoverRef} />, document.body)}
    </div>
  );
}

// Popover das abas "Em breve" - ícone, nome e descrição (mesmo texto que a aba
// tinha como card no launcher). Portalado pra document.body (ver comentário
// acima, em FinanceiroModule) - position:fixed com a posição já calculada em
// alternarPopover, não position:absolute relativo a um pai.
function AbaEmBrevePopover({ aba, pos, contentRef }) {
  const { t } = useTranslation();
  return (
    <div
      className="fin-em-breve-popover"
      ref={contentRef}
      style={{ top: pos.top, left: pos.left, "--fin-em-breve-caret-left": `${pos.caretLeft}px` }}
    >
      <span className="fin-em-breve-icone"><ModuleIcon name={aba.icon} size={22} /></span>
      <div>
        <h3 className="fin-em-breve-titulo">{t(aba.labelKey)}</h3>
        <p className="fin-em-breve-desc">{t(aba.descKey)}</p>
      </div>
    </div>
  );
}
