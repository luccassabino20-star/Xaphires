import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../state/AuthContext.jsx";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents } from "./dinheiro.js";

function IconLock({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function IconCheck({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// Meses civis 'YYYY-MM' entre de/ate (inclusive), na ordem em que aparecem.
function mesesNoPeriodo(de, ate) {
  if (!de || !ate) return [];
  const out = [];
  let [ano, mes] = de.slice(0, 7).split("-").map(Number);
  const [anoFim, mesFim] = ate.slice(0, 7).split("-").map(Number);
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    out.push(`${ano}-${String(mes).padStart(2, "0")}`);
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return out;
}
function rotuloMes(anoMes, lang) {
  const [ano, mes] = anoMes.split("-").map(Number);
  const fmt = new Intl.DateTimeFormat(lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "pt-BR", { month: "long", year: "numeric" });
  return fmt.format(new Date(ano, mes - 1, 1));
}

// Painel de Conciliação & Fechamento - confronto de saldos (o que já existe:
// saldoAtual vs saldoConferido, calculos.montarMovimentacao), lista dos
// finalizados ainda não conferidos com um toque pra marcar, e o fechamento
// mensal (trava real, ver bloqueadoPorFechamento em routes.js).
export default function ConciliacaoFechamentoDrawer({ resultado, de, ate, lang, onClose, onChanged }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const showToast = useToast();
  const ehMaster = user?.role === "master";

  const [fechamentos, setFechamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [mesEscolhido, setMesEscolhido] = useState("");
  const [processando, setProcessando] = useState(false);

  const meses = useMemo(() => mesesNoPeriodo(de, ate), [de, ate]);
  useEffect(() => { if (meses.length && !mesEscolhido) setMesEscolhido(meses[meses.length - 1]); }, [meses, mesEscolhido]);

  async function carregarFechamentos() {
    setCarregando(true);
    try {
      setFechamentos(await api.finListFechamentos());
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregarFechamentos(); }, []);

  const fechamentosNoPeriodo = useMemo(() => fechamentos.filter((f) => meses.includes(f.ano_mes)), [fechamentos, meses]);
  const fechadoSet = useMemo(() => new Set(fechamentos.map((f) => f.ano_mes)), [fechamentos]);

  const pendentes = useMemo(
    () => (resultado?.movimentos || []).filter((m) => !m.estornado && m.conferido !== 1),
    [resultado]
  );
  const divergencia = resultado ? (resultado.saldoAtual || 0) - (resultado.saldoConferido || 0) : 0;

  async function conciliar(m) {
    setErro("");
    try {
      await api.finDefinirConferido(m.id, true);
      onChanged?.();
    } catch (e) {
      setErro(translateError(e, t));
    }
  }

  async function fecharMes() {
    if (!mesEscolhido) return;
    setProcessando(true); setErro("");
    try {
      await api.finFecharMes(mesEscolhido);
      showToast(t("financeiro.movimentacao.conciliacao.mesFechadoToast", { mes: rotuloMes(mesEscolhido, lang) }));
      await carregarFechamentos();
    } catch (e) {
      setErro(translateError(e, t));
    } finally {
      setProcessando(false);
    }
  }
  async function reabrirMes(anoMes) {
    setProcessando(true); setErro("");
    try {
      await api.finReabrirMes(anoMes);
      showToast(t("financeiro.movimentacao.conciliacao.mesReabertoToast", { mes: rotuloMes(anoMes, lang) }));
      await carregarFechamentos();
    } catch (e) {
      setErro(translateError(e, t));
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal contato-form-modal mov-conciliacao-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        <div className="cobr-form-header">
          <span className="cobr-form-header-icon"><IconLock size={20} /></span>
          <div>
            <h2 className="cobr-form-title">{t("financeiro.movimentacao.conciliacao.titulo")}</h2>
            <p className="cobr-form-subtitle">{t("financeiro.movimentacao.conciliacao.subtitulo")}</p>
          </div>
        </div>

        {erro && <div className="fin-error">{erro}</div>}

        {!resultado ? (
          <p className="cobr-form-subtitle">{t("financeiro.mov.filtrePrompt")}</p>
        ) : (
          <>
            <div className="mov-conciliacao-confronto">
              <div>
                <span className="fin-kpi-label">{t("financeiro.mov.saldoAtual")}</span>
                <strong className="fin-kpi-value">{formatCents(resultado.saldoAtual, lang)}</strong>
              </div>
              <div>
                <span className="fin-kpi-label">{t("financeiro.mov.saldoConferido")}</span>
                <strong className="fin-kpi-value">{formatCents(resultado.saldoConferido, lang)}</strong>
              </div>
              <div>
                <span className="fin-kpi-label">{t("financeiro.movimentacao.conciliacao.divergencia")}</span>
                <strong className={"fin-kpi-value " + (divergencia === 0 ? "fin-receber" : "fin-pagar")}>{formatCents(divergencia, lang)}</strong>
              </div>
            </div>

            <h3 className="fin-mov-titulo">{t("financeiro.movimentacao.conciliacao.pendentesTitulo", { count: pendentes.length })}</h3>
            {pendentes.length === 0 ? (
              <p className="cobr-form-subtitle">{t("financeiro.movimentacao.conciliacao.semPendencias")}</p>
            ) : (
              <div className="mov-conciliacao-lista">
                {pendentes.map((m) => (
                  <div className="mov-conciliacao-item" key={m.id}>
                    <div className="mov-conciliacao-item-info">
                      <span className="mov-conciliacao-item-desc">{m.descricao || "-"}</span>
                      <span className="mov-conciliacao-item-data">{m.data?.split("-").reverse().join("/")}</span>
                    </div>
                    <span className={"fin-num " + (m.tipo === "receber" ? "fin-receber" : "fin-pagar")}>
                      {m.tipo === "receber" ? "+" : "-"} {formatCents(m.valor_cents, lang)}
                    </span>
                    <button type="button" className="btn-secondary btn-small" onClick={() => conciliar(m)}>
                      <IconCheck /> {t("financeiro.movimentacao.conciliacao.conciliar")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <h3 className="fin-mov-titulo">{t("financeiro.movimentacao.conciliacao.fechamentoTitulo")}</h3>
        {carregando ? (
          <div className="fin-loading">{t("common.loading")}</div>
        ) : (
          <>
            {meses.length > 0 && (
              <div className="mov-fechamento-acao">
                <select value={mesEscolhido} onChange={(e) => setMesEscolhido(e.target.value)}>
                  {meses.map((m) => (
                    <option key={m} value={m} disabled={fechadoSet.has(m)}>
                      {rotuloMes(m, lang)}{fechadoSet.has(m) ? ` (${t("financeiro.movimentacao.conciliacao.jaFechado")})` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button" className="recurrence-btn-primary" onClick={fecharMes}
                  disabled={!ehMaster || processando || fechadoSet.has(mesEscolhido)}
                  title={!ehMaster ? t("financeiro.movimentacao.conciliacao.somenteMaster") : undefined}
                >
                  {t("financeiro.movimentacao.conciliacao.fecharMes")}
                </button>
              </div>
            )}
            {fechamentosNoPeriodo.length > 0 && (
              <div className="mov-fechamento-lista">
                {fechamentosNoPeriodo.map((f) => (
                  <div className="mov-fechamento-item" key={f.ano_mes}>
                    <span>{rotuloMes(f.ano_mes, lang)}</span>
                    <button
                      type="button" className="btn-ghost btn-small" onClick={() => reabrirMes(f.ano_mes)}
                      disabled={!ehMaster || processando}
                      title={!ehMaster ? t("financeiro.movimentacao.conciliacao.somenteMaster") : undefined}
                    >
                      {t("financeiro.movimentacao.conciliacao.reabrir")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="cobr-form-footer">
          <button type="button" className="recurrence-btn-ghost" onClick={onClose}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}
