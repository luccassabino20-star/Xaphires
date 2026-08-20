import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import AccountMenu from "../../components/AccountMenu.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";
import ModuleIcon from "../ModuleIcon.jsx";
import IresSidebar from "./IresSidebar.jsx";
import LancamentosView from "./LancamentosView.jsx";
import TitulosView from "./TitulosView.jsx";
import MovimentacaoView from "./MovimentacaoView.jsx";
import FluxoView from "./FluxoView.jsx";
import FluxoCaixaMatrizView from "./FluxoCaixaMatrizView.jsx";
import DREView from "./DREView.jsx";
import ContasView from "./ContasView.jsx";
import ImportarExtratoView from "./ImportarExtratoView.jsx";
import CadastrosView from "./CadastrosView.jsx";

// Casca do módulo ERP IRES (id interno "financeiro"): header enxuto (voltar ao
// launcher + logo/nome + conta) e sidebar vertical retrátil à esquerda (ver
// IresSidebar.jsx) - trocou a barra de abas horizontal de propósito: com 9 telas
// reais mais 3 "em breve", a barra rolava na horizontal (scrollbar feia,
// descoberta só clicando). Sidebar com grupos (Financeiro/Relatórios & DRE)
// resolve isso sem esconder nada.
//
// Diferente do Kanban, não há reducer otimista - cada view busca e re-busca por
// conta própria, que é o padrão mais seguro para dado financeiro.
const POPOVER_LARGURA = 300;

export default function FinanceiroModule({ onExit }) {
  const { t } = useTranslation();
  const [aba, setAba] = useState("lancamentos");
  const [sidebarRecolhida, setSidebarRecolhida] = useState(false);
  const [popoverId, setPopoverId] = useState(null);
  const [popoverPos, setPopoverPos] = useState(null); // { top, left, caretLeft }
  // O botão que abriu o popover pode ficar dentro da sidebar (overflow-y:auto
  // quando muitos itens) - mesma armadilha do popover das abas antigas (ver
  // histórico deste arquivo): position:fixed calculado do
  // getBoundingClientRect() do botão, portalado pra document.body, nunca
  // position:absolute relativo a um pai com overflow.
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!popoverId) return;
    function handleClick(e) {
      const dentroDoBotao = triggerRef.current && triggerRef.current.contains(e.target);
      const dentroDoPopover = popoverRef.current && popoverRef.current.contains(e.target);
      if (!dentroDoBotao && !dentroDoPopover) setPopoverId(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popoverId]);

  function abrirFuturo(item, e) {
    if (popoverId === item.id) {
      setPopoverId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.min(rect.right + 10, window.innerWidth - POPOVER_LARGURA - 16);
    setPopoverPos({ top: rect.top, left, caretTop: rect.height / 2 - 6 });
    setPopoverId(item.id);
    triggerRef.current = e.currentTarget;
  }

  function selecionarAba(id) {
    setPopoverId(null);
    setAba(id);
  }

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

      <div className="fin-shell">
        <IresSidebar
          collapsed={sidebarRecolhida}
          onToggleCollapsed={() => setSidebarRecolhida((v) => !v)}
          aba={aba}
          onSelectAba={selecionarAba}
          onAbrirFuturo={abrirFuturo}
        />

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

      {popoverId &&
        popoverPos &&
        createPortal(
          <AbaEmBrevePopover
            item={{ id: popoverId, icon: iconeDoFuturo(popoverId), labelKey: `modules.${popoverId}.name`, descKey: `modules.${popoverId}.desc` }}
            pos={popoverPos}
            contentRef={popoverRef}
          />,
          document.body
        )}
    </div>
  );
}

function iconeDoFuturo(id) {
  return { "compras-estoque": "estoque", faturamento: "faturamento", "relatorios-bi": "bi" }[id];
}

// Popover dos itens "Em breve" da sidebar - ícone, nome e descrição (mesmo
// texto que o item tinha como card no launcher). Portalado pra document.body,
// position:fixed já calculada em abrirFuturo (acima).
function AbaEmBrevePopover({ item, pos, contentRef }) {
  const { t } = useTranslation();
  return (
    <div
      className="fin-em-breve-popover fin-em-breve-popover-lateral"
      ref={contentRef}
      style={{ top: pos.top, left: pos.left, "--fin-em-breve-caret-top": `${pos.caretTop}px` }}
    >
      <span className="fin-em-breve-icone"><ModuleIcon name={item.icon} size={22} /></span>
      <div>
        <h3 className="fin-em-breve-titulo">{t(item.labelKey)}</h3>
        <p className="fin-em-breve-desc">{t(item.descKey)}</p>
      </div>
    </div>
  );
}
