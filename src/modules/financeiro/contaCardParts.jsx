import { useEffect, useRef, useState } from "react";
import { formatCents } from "./dinheiro.js";
import { inicialBanco, corBanco } from "./bancos.js";

// Peças de conta bancária compartilhadas entre as duas telas que mostram conta
// (ContasCorrentesView.jsx, em Cadastros, e ContasView.jsx, o dashboard de
// tesouraria do menu Financeiro) - extraídas pra não duplicar ~150 linhas de
// card/menu numa segunda tela que precisa do mesmo card, só com um cabeçalho e
// KPIs diferentes em volta.

export function IconKebab({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
    </svg>
  );
}
export function IconExtrato({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v18l-2.5-1.7L13 21l-1-1.7-1 1.7-2.5-1.7L6 21z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

// Mostra só os últimos 4 dígitos do número da conta, o resto vira • - mesmo
// tratamento que um cartão de crédito, pedido explicitamente pro card/tabela.
export function mascararNumero(numero) {
  const n = String(numero || "").trim();
  if (n.length <= 4) return n;
  return "••••" + n.slice(-4);
}

export const TIPOS_CONTA = ["conta_corrente", "poupanca", "pagamento", "cartao_credito", "caixa"];

// Círculo de iniciais coloridas do banco - mesmo badge no card e na linha da
// tabela, sem logo real (nenhum asset de marca existe neste projeto).
export function BancoBadge({ banco, size = 24 }) {
  return (
    <span
      className="contas-badge-banco-inicial"
      style={{ background: corBanco(banco), width: size, height: size, fontSize: Math.round(size * 0.44) }}
    >
      {inicialBanco(banco)}
    </span>
  );
}

// Botão "..." + menu, auto-contido: cada instância gerencia a própria
// posição/abertura (position:fixed via getBoundingClientRect, mesma técnica de
// UserActionsMenu em UsersPanel.jsx) - quem usa só instancia
// <ContaAcoesKebab .../> sem precisar de um mapa de refs no componente pai.
export function ContaAcoesKebab({ conta, ativa, onEditar, onAjustarSaldo, onVerExtrato, onToggleAtiva, t, className }) {
  const [aberto, setAberto] = useState(false);
  const [coords, setCoords] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!aberto || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target) && !btnRef.current?.contains(e.target)) setAberto(false);
    }
    const scrollParent = btnRef.current?.closest(".contatos-table-wrap, .contas-card-grid");
    document.addEventListener("mousedown", handleClick);
    scrollParent?.addEventListener("scroll", () => setAberto(false));
    return () => document.removeEventListener("mousedown", handleClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  function acao(fn) {
    return () => { setAberto(false); fn(); };
  }

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={"row-menu-btn" + (className ? " " + className : "")}
        onClick={() => setAberto((v) => !v)}
        aria-label={t("financeiro.tesouraria.acoesLinha")}
      >
        <IconKebab />
      </button>
      {aberto && coords && (
        <div className="dropdown" ref={menuRef} style={{ position: "fixed", top: coords.top, right: coords.right }}>
          <div className="dropdown-item" onClick={acao(() => onEditar(conta))}>{t("financeiro.tesouraria.menuEditar")}</div>
          <div className="dropdown-item" onClick={acao(() => onAjustarSaldo(conta))}>{t("financeiro.tesouraria.menuAjustarSaldo")}</div>
          <div className="dropdown-item" onClick={acao(() => onVerExtrato(conta.id))}>{t("financeiro.tesouraria.verExtrato")}</div>
          <div className="dropdown-divider" />
          <div className="dropdown-item" onClick={acao(() => onToggleAtiva(conta))}>{ativa ? t("financeiro.cad.desativar") : t("financeiro.cad.ativar")}</div>
        </div>
      )}
    </>
  );
}

// Card escuro de conta bancária (grid "Bank Cards") - badge, nome, identificação
// mascarada, saldo em destaque (ou "••••••" com ocultarSaldo), pílulas de status
// e rodapé com Ver Extrato + o kebab acima.
export function ContaCard({ conta: c, saldo, lang, rotuloTipo, ocultarSaldo, onEditar, onAjustarSaldo, onVerExtrato, onToggleAtiva, t }) {
  return (
    <div className={"contas-card" + (c.ativo ? "" : " contas-card-inativa")}>
      <div className="contas-card-topo">
        <BancoBadge banco={c.banco} size={38} />
        <div className="contas-card-status-pills">
          {!!c.principal && <span className="contas-card-status-pill contas-status-principal">{t("financeiro.tesouraria.principal")}</span>}
          <span className={"contas-card-status-pill " + (c.ativo ? "contas-status-ativa" : "contas-status-inativa")}>
            {c.ativo ? t("financeiro.cad.ativo") : t("financeiro.cad.inativo")}
          </span>
        </div>
      </div>
      <div className="contas-card-nome">{c.nome}</div>
      <div className="contas-card-identificacao">
        {c.agencia && `${t("financeiro.tesouraria.agenciaAbrev")} ${c.agencia} • `}
        {t("financeiro.tesouraria.contaAbrev")} {mascararNumero(c.numero) || "-"}
      </div>
      <div className="contas-card-saldo">{ocultarSaldo ? "••••••" : formatCents(saldo, lang)}</div>
      <div className="contas-card-hover-acoes">
        <button type="button" className="contas-card-link" onClick={() => onVerExtrato(c.id)}>
          <IconExtrato /> {t("financeiro.tesouraria.verExtrato")}
        </button>
        <ContaAcoesKebab
          conta={c}
          ativa={!!c.ativo}
          onEditar={onEditar}
          onAjustarSaldo={onAjustarSaldo}
          onVerExtrato={onVerExtrato}
          onToggleAtiva={onToggleAtiva}
          t={t}
          className="contas-card-kebab"
        />
      </div>
    </div>
  );
}
