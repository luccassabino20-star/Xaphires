import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents } from "./dinheiro.js";
import NovaContaBancariaModal from "./NovaContaBancariaModal.jsx";
import LancamentoManualModal from "./LancamentoManualModal.jsx";
import { ContaAcoesKebab, ContaCard, BancoBadge, mascararNumero, TIPOS_CONTA } from "./contaCardParts.jsx";

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

// Central de Contas Bancárias & Tesouraria (Cadastros → Contas correntes): o
// formulário solto + tabela crua de antes viram header/KPIs/toggle Cards-Tabela
// + modal de cadastro, mesmo padrão Ultra-Premium de ContatosView.jsx. Card,
// badge e menu de ações moram em contaCardParts.jsx - compartilhados com o
// dashboard de tesouraria (ContasView.jsx, menu Financeiro), que mostra as
// mesmas contas com um cabeçalho e KPIs diferentes.
export default function ContasCorrentesView({ contas, lang, onCriar, onEditar, onVerExtrato }) {
  const { t } = useTranslation();
  const [saldos, setSaldos] = useState([]);
  const [erroSaldos, setErroSaldos] = useState("");
  const [modo, setModo] = useState("cards");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [ajustando, setAjustando] = useState(null); // conta em "Ajustar Saldo"

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
    setEditando(c);
    setModalAberto(true);
  }
  function toggleAtiva(c) {
    onEditar(c.id, { ativo: c.ativo ? 0 : 1 });
  }
  function verExtrato(contaId) {
    onVerExtrato?.(contaId);
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
          {contas.map((c) => (
            <ContaCard
              key={c.id}
              conta={c}
              saldo={saldoPorConta[c.id]?.saldo ?? c.saldo_inicial_cents ?? 0}
              lang={lang}
              rotuloTipo={rotuloTipo}
              onEditar={abrirEdicao}
              onAjustarSaldo={setAjustando}
              onVerExtrato={verExtrato}
              onToggleAtiva={toggleAtiva}
              t={t}
            />
          ))}
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
                        <BancoBadge banco={c.banco} />
                        {c.banco || "-"}
                      </span>
                    </td>
                    <td>{c.nome}</td>
                    <td>{c.agencia ? `${c.agencia} / ` : ""}{mascararNumero(c.numero) || "-"}</td>
                    <td><span className={"contatos-badge-tipo contas-badge-tipo-" + (c.tipo || "conta_corrente")}>{rotuloTipo(c.tipo)}</span></td>
                    <td className="fin-num">{formatCents(saldo, lang)}</td>
                    <td className="contatos-cell-acoes">
                      <ContaAcoesKebab
                        conta={c}
                        ativa={!!c.ativo}
                        onEditar={abrirEdicao}
                        onAjustarSaldo={setAjustando}
                        onVerExtrato={verExtrato}
                        onToggleAtiva={toggleAtiva}
                        t={t}
                      />
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
