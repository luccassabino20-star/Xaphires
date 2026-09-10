import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
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
function IconUpload({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4m0 0-4 4m4-4 4 4" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
function IconEyeOpen({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconEyeClosed({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.1-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

const LS_OCULTAR_SALDO = "xaphires-tesouraria-ocultar-saldo";

function anoCivil() {
  return new Date().getFullYear();
}
function mesCivil() {
  return new Date().getMonth() + 1;
}

// Dashboard de Tesouraria e Liquidez (Financeiro → Contas Bancárias & Caixa):
// era uma tela só de leitura (um KPI + tabela crua); vira uma tela dona do
// próprio estado, no mesmo padrão Ultra-Premium de ContasCorrentesView.jsx
// (Cadastros → Contas correntes) - de propósito reaproveita o mesmo card/menu
// (contaCardParts.jsx) e o mesmo NovaContaBancariaModal, então cadastrar ou
// editar uma conta aqui é o mesmo cadastro, só chegando por outra porta.
export default function ContasView({ onVerExtrato }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();

  const [contas, setContas] = useState([]);
  const [saldos, setSaldos] = useState([]);
  const [fluxoMes, setFluxoMes] = useState(null);
  const [erro, setErro] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [ajustando, setAjustando] = useState(null);
  const [ocultarSaldo, setOcultarSaldo] = useState(() => {
    try { return localStorage.getItem(LS_OCULTAR_SALDO) === "1"; } catch { return false; }
  });

  async function carregar() {
    try {
      const [cts, sld, fluxo] = await Promise.all([
        api.finListContas(), api.finGetSaldos(), api.finGetFluxo(anoCivil()),
      ]);
      setContas(cts);
      setSaldos(sld.contas || []);
      setFluxoMes(fluxo.linhas?.find((l) => l.mes === mesCivil()) || null);
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  function alternarPrivacidade() {
    setOcultarSaldo((v) => {
      const novo = !v;
      try { localStorage.setItem(LS_OCULTAR_SALDO, novo ? "1" : "0"); } catch { /* privado, sem localStorage disponível */ }
      return novo;
    });
  }

  async function criar(dados) {
    await api.finCreateConta(dados);
    showToast(t("financeiro.cad.criado"));
    await carregar();
  }
  async function editar(id, dados) {
    await api.finUpdateConta(id, dados);
    showToast(t("financeiro.cad.criado"));
    await carregar();
  }
  function abrirNovo() {
    setEditando(null);
    setModalAberto(true);
  }
  function abrirEdicao(c) {
    setEditando(c);
    setModalAberto(true);
  }
  function toggleAtiva(c) {
    editar(c.id, { ativo: c.ativo ? 0 : 1 }).catch((e) => alert(translateError(e, t)));
  }
  function verExtrato(contaId) {
    onVerExtrato?.(contaId);
  }

  const saldoPorConta = useMemo(() => Object.fromEntries(saldos.map((s) => [s.id, s])), [saldos]);
  const ativas = useMemo(() => contas.filter((c) => c.ativo), [contas]);
  const saldoConsolidado = useMemo(
    () => ativas.reduce((soma, c) => soma + (saldoPorConta[c.id]?.saldo ?? c.saldo_inicial_cents ?? 0), 0),
    [ativas, saldoPorConta]
  );
  // "Imediata" exclui caixa (dinheiro físico, não movimentável eletronicamente
  // na hora) e cartão de crédito (não é um ativo, é uma forma de pagamento) -
  // só contas de depósito/pagamento contam como liquidez de fato disponível.
  const disponibilidadeImediata = useMemo(
    () => ativas
      .filter((c) => ["conta_corrente", "poupanca", "pagamento"].includes(c.tipo || "conta_corrente"))
      .reduce((soma, c) => soma + (saldoPorConta[c.id]?.saldo ?? c.saldo_inicial_cents ?? 0), 0),
    [ativas, saldoPorConta]
  );
  const rotuloTipo = (tipo) => t(`financeiro.tesouraria.tipo.${tipo || "conta_corrente"}`);
  const exibirValor = (cents) => (ocultarSaldo ? "••••••" : formatCents(cents, lang));

  return (
    <div className="contas-view">
      <div className="contatos-header">
        <div>
          <h2 className="contatos-titulo">{t("financeiro.tesouraria.dashboard.titulo")}</h2>
          <p className="contatos-contador">{t("financeiro.tesouraria.dashboard.subtitulo")}</p>
        </div>
        <div className="contatos-header-acoes">
          <button type="button" className="btn-secondary btn-small" onClick={() => verExtrato(undefined)}>
            <IconUpload /> {t("financeiro.tesouraria.dashboard.importarExtrato")}
          </button>
          <button type="button" className="recurrence-btn-primary" onClick={abrirNovo}>
            <IconPlus /> {t("financeiro.tesouraria.novaConta")}
          </button>
        </div>
      </div>

      {erro && <div className="fin-error">{erro}</div>}

      <div className="fin-kpis">
        <div className="fin-kpi">
          <div className="contas-kpi-topo">
            <span className="fin-kpi-label">{t("financeiro.tesouraria.kpi.saldoConsolidado")}</span>
            <button
              type="button"
              className="contas-kpi-privacidade"
              onClick={alternarPrivacidade}
              aria-label={t(ocultarSaldo ? "financeiro.tesouraria.dashboard.exibirSaldo" : "financeiro.tesouraria.dashboard.ocultarSaldo")}
              title={t(ocultarSaldo ? "financeiro.tesouraria.dashboard.exibirSaldo" : "financeiro.tesouraria.dashboard.ocultarSaldo")}
            >
              {ocultarSaldo ? <IconEyeClosed /> : <IconEyeOpen />}
            </button>
          </div>
          <span className="fin-kpi-value">{exibirValor(saldoConsolidado)}</span>
          <span className="contas-kpi-badge">{t("financeiro.tesouraria.dashboard.atualizadoAgora")}</span>
        </div>
        <div className="fin-kpi fin-kpi-receber">
          <span className="fin-kpi-label">{t("financeiro.tesouraria.dashboard.kpiEntradas")}</span>
          <span className="fin-kpi-value">{exibirValor(fluxoMes?.entradasPrevistas || 0)}</span>
        </div>
        <div className="fin-kpi fin-kpi-pagar">
          <span className="fin-kpi-label">{t("financeiro.tesouraria.dashboard.kpiSaidas")}</span>
          <span className="fin-kpi-value">{exibirValor(fluxoMes?.saidasPrevistas || 0)}</span>
        </div>
        <div className="fin-kpi">
          <span className="fin-kpi-label">{t("financeiro.tesouraria.dashboard.kpiDisponibilidade")}</span>
          <span className="fin-kpi-value">{exibirValor(disponibilidadeImediata)}</span>
        </div>
      </div>

      {contas.length === 0 ? (
        <div className="contas-empty">
          <span className="contas-empty-icone"><IconWallet size={28} /></span>
          <h3 className="contas-empty-titulo">{t("financeiro.tesouraria.dashboard.emptyTitulo")}</h3>
          <p className="contas-empty-texto">{t("financeiro.tesouraria.dashboard.emptyTexto")}</p>
          <button type="button" className="recurrence-btn-primary" onClick={abrirNovo}>
            {t("financeiro.tesouraria.dashboard.emptyBotao")}
          </button>
        </div>
      ) : (
        <>
          <div className="contas-card-grid">
            {contas.map((c) => (
              <ContaCard
                key={c.id}
                conta={c}
                saldo={saldoPorConta[c.id]?.saldo ?? c.saldo_inicial_cents ?? 0}
                lang={lang}
                rotuloTipo={rotuloTipo}
                ocultarSaldo={ocultarSaldo}
                onEditar={abrirEdicao}
                onAjustarSaldo={setAjustando}
                onVerExtrato={verExtrato}
                onToggleAtiva={toggleAtiva}
                t={t}
              />
            ))}
          </div>

          <h3 className="fin-mov-titulo">{t("financeiro.tesouraria.dashboard.posicaoCaixa")}</h3>
          <div className="contatos-table-wrap">
            <table className="fin-table contatos-table">
              <thead>
                <tr>
                  <th>{t("financeiro.tesouraria.colInstituicao")}</th>
                  <th>{t("financeiro.tesouraria.colTipo")}</th>
                  <th>{t("financeiro.tesouraria.dashboard.colChavePix")}</th>
                  <th className="fin-num">{t("financeiro.tesouraria.colSaldoAtual")}</th>
                  <th>{t("financeiro.tesouraria.dashboard.colUltimaMovimentacao")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contas.map((c) => {
                  const s = saldoPorConta[c.id];
                  const saldo = s?.saldo ?? c.saldo_inicial_cents ?? 0;
                  return (
                    <tr key={c.id} className={c.ativo ? "" : "fin-row-pago"}>
                      <td>
                        <span className="contas-badge-banco">
                          <BancoBadge banco={c.banco} />
                          {c.nome}
                        </span>
                      </td>
                      <td><span className={"contatos-badge-tipo contas-badge-tipo-" + (c.tipo || "conta_corrente")}>{rotuloTipo(c.tipo)}</span></td>
                      <td>{c.chave_pix || "-"}</td>
                      <td className="fin-num">{exibirValor(saldo)}</td>
                      <td>{s?.ultimaMovimentacao ? s.ultimaMovimentacao.split("-").reverse().join("/") : t("financeiro.tesouraria.dashboard.semMovimentacao")}</td>
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
        </>
      )}

      {modalAberto && (
        <NovaContaBancariaModal
          conta={editando}
          tipos={TIPOS_CONTA}
          onClose={() => setModalAberto(false)}
          onSalvar={async (dados) => {
            if (editando) await editar(editando.id, dados);
            else await criar(dados);
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
