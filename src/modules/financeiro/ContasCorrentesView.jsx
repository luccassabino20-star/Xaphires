import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents } from "./dinheiro.js";
import { inicialBanco, corBanco } from "./bancos.js";
import NovaContaBancariaModal from "./NovaContaBancariaModal.jsx";
import LancamentoManualModal from "./LancamentoManualModal.jsx";

function IconWallet({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3" />
      <path d="M3 7v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-4a2.5 2.5 0 0 0 0 5h5" />
    </svg>
  );
}
function IconPlus({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconKebab({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
    </svg>
  );
}
function IconExtrato({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v18l-2.5-1.7L13 21l-1-1.7-1 1.7-2.5-1.7L6 21z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

// Mostra só os últimos 4 dígitos do número da conta, o resto vira • - mesmo
// tratamento que um cartão de crédito, pedido explicitamente pro card/tabela.
function mascararNumero(numero) {
  const n = String(numero || "").trim();
  if (n.length <= 4) return n;
  return "••••" + n.slice(-4);
}

const TIPOS_CONTA = ["conta_corrente", "poupanca", "pagamento", "cartao_credito", "caixa"];

// Central de Contas Bancárias & Tesouraria (Cadastros → Contas correntes): o
// formulário solto + tabela crua de antes viram header/KPIs/toggle Cards-Tabela
// + modal de cadastro, mesmo padrão Ultra-Premium de ContatosView.jsx.
export default function ContasCorrentesView({ contas, lang, onCriar, onEditar, onVerExtrato }) {
  const { t } = useTranslation();
  const [saldos, setSaldos] = useState([]);
  const [erroSaldos, setErroSaldos] = useState("");
  const [modo, setModo] = useState("cards");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [ajustando, setAjustando] = useState(null); // conta em "Ajustar Saldo"
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuAnchorRefs = useRef({});

  // Saldo REAL (inicial + movimento), não só o saldo_inicial_cents gravado -
  // vem de montarSaldos() no servidor, fonte única já usada por ContasView.jsx.
  // Refeita sempre que a lista de contas muda (criar/editar/desativar já dispara
  // o carregar() do CadastrosView, que troca a prop `contas`).
  useEffect(() => {
    let cancelado = false;
    api.finGetSaldos()
      .then((r) => { if (!cancelado) setSaldos(r.contas || []); })
      .catch((e) => { if (!cancelado) setErroSaldos(translateError(e, t)); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contas]);

  const saldoPorConta = useMemo(() => Object.fromEntries(saldos.map((s) => [s.id, s])), [saldos]);
  const ativas = useMemo(() => contas.filter((c) => c.ativo), [contas]);
  const saldoConsolidado = useMemo(
    () => ativas.reduce((soma, c) => soma + (saldoPorConta[c.id]?.saldo ?? c.saldo_inicial_cents ?? 0), 0),
    [ativas, saldoPorConta]
  );
  const maiorPosicao = useMemo(() => {
    let melhor = null;
    for (const c of ativas) {
      const saldo = saldoPorConta[c.id]?.saldo ?? c.saldo_inicial_cents ?? 0;
      if (!melhor || saldo > melhor.saldo) melhor = { conta: c, saldo };
    }
    return melhor;
  }, [ativas, saldoPorConta]);

  const rotuloTipo = (tipo) => t(`financeiro.tesouraria.tipo.${tipo || "conta_corrente"}`);

  function abrirNovo() {
    setEditando(null);
    setModalAberto(true);
  }
  function abrirEdicao(c) {
    setOpenMenuId(null);
    setEditando(c);
    setModalAberto(true);
  }

  return (
    <div className="contas-view">
      <div className="contatos-header">
        <div>
          <h2 className="contatos-titulo">{t("financeiro.tesouraria.titulo")}</h2>
          <p className="contatos-contador">{t("financeiro.tesouraria.subtitulo")}</p>
        </div>
        <div className="contatos-header-acoes">
          <button type="button" className="recurrence-btn-primary" onClick={abrirNovo}>
            <IconPlus /> {t("financeiro.tesouraria.novaConta")}
          </button>
        </div>
      </div>

      {erroSaldos && <div className="fin-error">{erroSaldos}</div>}

      <div className="fin-kpis">
        <div className="fin-kpi">
          <span className="fin-kpi-label">{t("financeiro.tesouraria.kpi.saldoConsolidado")}</span>
          <span className="fin-kpi-value">{formatCents(saldoConsolidado, lang)}</span>
        </div>
        <div className="fin-kpi">
          <span className="fin-kpi-label">{t("financeiro.tesouraria.kpi.contasAtivas")}</span>
          <span className="fin-kpi-value">{ativas.length}</span>
        </div>
        <div className="fin-kpi">
          <span className="fin-kpi-label">{t("financeiro.tesouraria.kpi.maiorPosicao")}</span>
          <span className="fin-kpi-value">{maiorPosicao ? formatCents(maiorPosicao.saldo, lang) : "-"}</span>
          {maiorPosicao && <span className="fin-cad-hint">{maiorPosicao.conta.banco || maiorPosicao.conta.nome}</span>}
        </div>
      </div>

      {contas.length > 0 && (
        <div className="timing-toggle contatos-segmented">
          <button type="button" className={"timing-toggle-btn" + (modo === "cards" ? " active" : "")} onClick={() => setModo("cards")}>
            {t("financeiro.tesouraria.modoCards")}
          </button>
          <button type="button" className={"timing-toggle-btn" + (modo === "tabela" ? " active" : "")} onClick={() => setModo("tabela")}>
            {t("financeiro.tesouraria.modoTabela")}
          </button>
        </div>
      )}

      {contas.length === 0 ? (
        <div className="contas-empty">
          <span className="contas-empty-icone"><IconWallet size={28} /></span>
          <h3 className="contas-empty-titulo">{t("financeiro.tesouraria.emptyTitulo")}</h3>
          <p className="contas-empty-texto">{t("financeiro.tesouraria.emptyTexto")}</p>
          <button type="button" className="recurrence-btn-primary" onClick={abrirNovo}>
            {t("financeiro.tesouraria.emptyBotao")}
          </button>
        </div>
      ) : modo === "cards" ? (
        <div className="contas-card-grid">
          {contas.map((c) => {
            const saldo = saldoPorConta[c.id]?.saldo ?? c.saldo_inicial_cents ?? 0;
            return (
              <div className={"contas-card" + (c.ativo ? "" : " contas-card-inativa")} key={c.id}>
                <div className="contas-card-topo">
                  <span className="contas-card-banco-badge" style={{ background: corBanco(c.banco) }}>{inicialBanco(c.banco)}</span>
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
                <div className="contas-card-saldo">{formatCents(saldo, lang)}</div>
                <div className="contas-card-hover-acoes">
                  <button type="button" className="contas-card-link" onClick={() => onVerExtrato?.(c.id)}>
                    <IconExtrato /> {t("financeiro.tesouraria.verExtrato")}
                  </button>
                  <button
                    type="button"
                    ref={(el) => { menuAnchorRefs.current[c.id] = el; }}
                    className="row-menu-btn contas-card-kebab"
                    onClick={() => setOpenMenuId((cur) => (cur === c.id ? null : c.id))}
                    aria-label={t("financeiro.tesouraria.acoesLinha")}
                  >
                    <IconKebab />
                  </button>
                </div>
                {openMenuId === c.id && (
                  <ContaActionsMenu
                    anchorEl={menuAnchorRefs.current[c.id]}
                    ativa={!!c.ativo}
                    onClose={() => setOpenMenuId(null)}
                    onEditar={() => abrirEdicao(c)}
                    onAjustarSaldo={() => { setOpenMenuId(null); setAjustando(c); }}
                    onVerExtrato={() => { setOpenMenuId(null); onVerExtrato?.(c.id); }}
                    onToggleAtiva={() => { setOpenMenuId(null); onEditar(c.id, { ativo: c.ativo ? 0 : 1 }); }}
                    t={t}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="contatos-table-wrap">
          <table className="fin-table contatos-table">
            <thead>
              <tr>
                <th>{t("financeiro.tesouraria.colInstituicao")}</th>
                <th>{t("financeiro.tesouraria.colIdentificacao")}</th>
                <th>{t("financeiro.tesouraria.colAgenciaNumero")}</th>
                <th>{t("financeiro.tesouraria.colTipo")}</th>
                <th className="fin-num">{t("financeiro.tesouraria.colSaldoAtual")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => {
                const saldo = saldoPorConta[c.id]?.saldo ?? c.saldo_inicial_cents ?? 0;
                return (
                  <tr key={c.id} className={c.ativo ? "" : "fin-row-pago"}>
                    <td>
                      <span className="contas-badge-banco">
                        <span className="contas-badge-banco-inicial" style={{ background: corBanco(c.banco) }}>{inicialBanco(c.banco)}</span>
                        {c.banco || "-"}
                      </span>
                    </td>
                    <td>{c.nome}</td>
                    <td>{c.agencia ? `${c.agencia} / ` : ""}{mascararNumero(c.numero) || "-"}</td>
                    <td><span className={"contatos-badge-tipo contas-badge-tipo-" + (c.tipo || "conta_corrente")}>{rotuloTipo(c.tipo)}</span></td>
                    <td className="fin-num">{formatCents(saldo, lang)}</td>
                    <td className="contatos-cell-acoes">
                      <button
                        type="button"
                        ref={(el) => { menuAnchorRefs.current[c.id] = el; }}
                        className="row-menu-btn"
                        onClick={() => setOpenMenuId((cur) => (cur === c.id ? null : c.id))}
                        aria-label={t("financeiro.tesouraria.acoesLinha")}
                      >
                        <IconKebab />
                      </button>
                      {openMenuId === c.id && (
                        <ContaActionsMenu
                          anchorEl={menuAnchorRefs.current[c.id]}
                          ativa={!!c.ativo}
                          onClose={() => setOpenMenuId(null)}
                          onEditar={() => abrirEdicao(c)}
                          onAjustarSaldo={() => { setOpenMenuId(null); setAjustando(c); }}
                          onVerExtrato={() => { setOpenMenuId(null); onVerExtrato?.(c.id); }}
                          onToggleAtiva={() => { setOpenMenuId(null); onEditar(c.id, { ativo: c.ativo ? 0 : 1 }); }}
                          t={t}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalAberto && (
        <NovaContaBancariaModal
          conta={editando}
          tipos={TIPOS_CONTA}
          onClose={() => setModalAberto(false)}
          onSalvar={async (dados) => {
            if (editando) await onEditar(editando.id, dados);
            else await onCriar(dados);
            setModalAberto(false);
          }}
        />
      )}

      {ajustando && (
        <LancamentoManualModal
          contaIdInicial={ajustando.id}
          onClose={() => setAjustando(null)}
          onCriado={() => setAjustando(null)}
        />
      )}
    </div>
  );
}

// Mesmo padrão position:fixed de ContatoActionsMenu (ContatosView.jsx), que
// por sua vez replica UserActionsMenu (UsersPanel.jsx) - sem CSS novo pro
// menu em si, só as classes .dropdown/.dropdown-item já existentes.
function ContaActionsMenu({ anchorEl, ativa, onClose, onEditar, onAjustarSaldo, onVerExtrato, onToggleAtiva, t }) {
  const ref = useRef(null);
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [anchorEl]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) && !anchorEl?.contains(e.target)) onClose();
    }
    const scrollParent = anchorEl?.closest(".contatos-table-wrap, .contas-card-grid");
    document.addEventListener("mousedown", handleClick);
    scrollParent?.addEventListener("scroll", onClose);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      scrollParent?.removeEventListener("scroll", onClose);
    };
  }, [onClose, anchorEl]);

  if (!coords) return null;

  return (
    <div className="dropdown" ref={ref} style={{ position: "fixed", top: coords.top, right: coords.right }}>
      <div className="dropdown-item" onClick={onEditar}>{t("financeiro.tesouraria.menuEditar")}</div>
      <div className="dropdown-item" onClick={onAjustarSaldo}>{t("financeiro.tesouraria.menuAjustarSaldo")}</div>
      <div className="dropdown-item" onClick={onVerExtrato}>{t("financeiro.tesouraria.verExtrato")}</div>
      <div className="dropdown-divider" />
      <div className="dropdown-item" onClick={onToggleAtiva}>{ativa ? t("financeiro.cad.desativar") : t("financeiro.cad.ativar")}</div>
    </div>
  );
}
