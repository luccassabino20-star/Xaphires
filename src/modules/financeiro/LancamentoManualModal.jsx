import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents, reaisParaCents } from "./dinheiro.js";
import { comCodigo, rotuloConta, detalheConta } from "./rotulo.js";
import SearchSelect from "./SearchSelect.jsx";

// Tipos de Movimento e a direção de cada um (espelho do MOVIMENTOS do servidor,
// que é a autoridade da regra débito/crédito). "pagar" = débito/saída;
// "receber" = crédito/entrada. A ordem aqui é a ordem do dropdown.
const MOVIMENTOS = [
  ["tarifa_bancaria", "pagar"],
  ["juros_pagos", "pagar"],
  ["juros_recebidos", "receber"],
  ["rendimento_aplicacao", "receber"],
  ["aplicacao_financeira", "pagar"],
  ["resgate_aplicacao", "receber"],
  ["outras_entradas", "receber"],
  ["outras_saidas", "pagar"],
];
const DIRECAO = Object.fromEntries(MOVIMENTOS);

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Lançamento Manual dos Movimentos: cria um título já classificado por Movimento
// (que decide débito/crédito), em aberto na conta escolhida, com rateio opcional
// por Classe + Centro. O rateio, se usado, precisa fechar o valor do lançamento.
export default function LancamentoManualModal({ onClose, onCriado }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();

  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [centros, setCentros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Dados do lançamento
  const [contaId, setContaId] = useState("");
  const [movimento, setMovimento] = useState("tarifa_bancaria");
  const [data, setData] = useState(hojeCivil());
  const [valor, setValor] = useState("");
  const [referencia, setReferencia] = useState("");
  const [documento, setDocumento] = useState("");

  // Rateio: linha em construção + itens já adicionados na grade.
  const [tipoRateio, setTipoRateio] = useState("percentual"); // "percentual" | "valor"
  const [lClasse, setLClasse] = useState("");
  const [lCentro, setLCentro] = useState("");
  const [lPct, setLPct] = useState("");
  const [lValor, setLValor] = useState("");
  const [itens, setItens] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [cos, cats, ccs] = await Promise.all([api.finListContas(), api.finListCategorias(lang), api.finListCentrosCusto()]);
        setContas(cos); setCategorias(cats); setCentros(ccs);
      } catch (e) { setErro(translateError(e, t)); }
      finally { setCarregando(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contasAtivas = useMemo(() => contas.filter((c) => c.ativo === 1), [contas]);
  const contaOpts = useMemo(() => contasAtivas.map((c) => ({ id: c.id, label: rotuloConta(c) })), [contasAtivas]);
  const contaSel = useMemo(() => contasAtivas.find((c) => c.id === contaId) || null, [contasAtivas, contaId]);
  useEffect(() => { if (!contaId && contasAtivas.length) setContaId(contasAtivas[0].id); }, [contasAtivas, contaId]);
  const centrosSelecionaveis = useMemo(() => centros.filter((c) => c.tipo !== "sintetico" && c.ativo === 1), [centros]);
  const catById = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias]);
  const centroById = useMemo(() => Object.fromEntries(centros.map((c) => [c.id, c])), [centros]);

  const baseCents = reaisParaCents(valor) || 0;
  const totalRateado = useMemo(() => itens.reduce((s, i) => s + i.valorCents, 0), [itens]);
  const restante = baseCents - totalRateado;
  const centrosUsados = useMemo(() => new Set(itens.map((i) => i.centroCustoId)), [itens]);

  // % e R$ da LINHA em construção andam juntos, contra o valor do lançamento.
  function onLinhaPct(v) {
    setLPct(v);
    const pct = Number(String(v).replace(",", ".")) || 0;
    setLValor(baseCents ? String(Math.round((baseCents * pct) / 100) / 100) : "");
  }
  function onLinhaValor(v) {
    setLValor(v);
    const cents = reaisParaCents(v) || 0;
    setLPct(baseCents ? String(Math.round((cents / baseCents) * 10000) / 100) : "");
  }
  function adicionar() {
    setErro("");
    const valorCents = reaisParaCents(lValor) || 0;
    if (!lClasse) return setErro(t("financeiro.manual.escolhaClasse"));
    if (!lCentro) return setErro(t("financeiro.rateio.escolhaCentro"));
    if (valorCents <= 0) return setErro(t("financeiro.rateio.valorInvalido"));
    if (centrosUsados.has(lCentro)) return setErro(t("financeiro.rateio.duplicado"));
    const pct = baseCents ? Math.round((valorCents / baseCents) * 10000) / 100 : 0;
    setItens((xs) => [...xs, { categoryId: lClasse, centroCustoId: lCentro, valorCents, pct }]);
    setLClasse(""); setLCentro(""); setLPct(""); setLValor("");
  }
  function remover(idx) { setItens((xs) => xs.filter((_, i) => i !== idx)); }

  async function salvar() {
    setErro("");
    const valorCents = reaisParaCents(valor);
    if (!contaId) return setErro(t("financeiro.mov.selecioneConta"));
    if (!data) return setErro(t("financeiro.manual.informeData"));
    if (!valorCents || valorCents <= 0) return setErro(t("financeiro.form.valorInvalido"));
    if (itens.length && totalRateado !== valorCents) return setErro(t("financeiro.rateio.naoFecha"));
    setSalvando(true);
    try {
      await api.finCriarMovimentoManual({
        contaId, movimento, data, valorCents,
        referencia: referencia.trim(), documento: documento.trim(),
        rateio: itens.map((i) => ({ categoryId: i.categoryId, centroCustoId: i.centroCustoId, valorCents: i.valorCents })),
      });
      showToast(t("financeiro.manual.criado"));
      onCriado?.();
      onClose();
    } catch (e) {
      setErro(translateError(e, t));
    } finally {
      setSalvando(false);
    }
  }

  const ehEntrada = DIRECAO[movimento] === "receber";

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-wide fin-manual">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
        <h2 className="fin-manual-titulo">{t("financeiro.manual.titulo")}</h2>

        {carregando ? (
          <div className="fin-loading">{t("common.loading")}</div>
        ) : (
          <div className="modal-body fin-modal-body">
            {erro && <div className="fin-error">{erro}</div>}

            {/* Dados do lançamento */}
            <fieldset className="fin-bloco">
              <legend>{t("financeiro.manual.dados")}</legend>
              <div className="fin-modal-grid">
                <label className="fin-field">
                  <span>{t("financeiro.contas.nome")}</span>
                  {contasAtivas.length === 0 ? (
                    <span className="fin-cad-hint">{t("financeiro.importar.semContas")}</span>
                  ) : (
                    <SearchSelect value={contaId} onChange={setContaId} options={contaOpts} allLabel={t("financeiro.baixa.semConta")} />
                  )}
                  {contaSel && (detalheConta(contaSel) || contaSel.banco) && (
                    <span className="fin-conta-detalhe">{[contaSel.banco, detalheConta(contaSel)].filter(Boolean).join(" · ")}</span>
                  )}
                </label>
                <label className="fin-field">
                  <span>{t("financeiro.manual.movimento")}</span>
                  <select value={movimento} onChange={(e) => setMovimento(e.target.value)}>
                    {MOVIMENTOS.map(([k, dir]) => (
                      <option key={k} value={k}>
                        {t("financeiro.manual.mov." + k)} ({t(dir === "receber" ? "financeiro.manual.credito" : "financeiro.manual.debito")})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="fin-field">
                  <span>{t("financeiro.manual.data")}</span>
                  <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
                </label>
                <label className="fin-field">
                  <span>{t("financeiro.col.valor")}</span>
                  <input type="number" step="0.01" min="0" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
                </label>
                <label className="fin-field fin-field-wide">
                  <span>{t("financeiro.manual.referencia")}</span>
                  <input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder={t("financeiro.manual.referenciaPlaceholder")} />
                </label>
                <label className="fin-field">
                  <span>{t("financeiro.manual.documento")}</span>
                  <input type="text" value={documento} onChange={(e) => setDocumento(e.target.value)} />
                </label>
              </div>
              <p className="fin-cad-hint">
                {ehEntrada ? t("financeiro.manual.dicaCredito") : t("financeiro.manual.dicaDebito")}
              </p>
            </fieldset>

            {/* Apropriação / Rateio por Classe e Centro */}
            <fieldset className="fin-bloco">
              <legend>{t("financeiro.manual.rateioTitulo")}</legend>
              <div className="fin-manual-rateio-editor">
                <label className="fin-field">
                  <span>{t("financeiro.manual.tipoRateio")}</span>
                  <select value={tipoRateio} onChange={(e) => setTipoRateio(e.target.value)}>
                    <option value="percentual">{t("financeiro.manual.porPercentual")}</option>
                    <option value="valor">{t("financeiro.manual.porValor")}</option>
                  </select>
                </label>
                <label className="fin-field">
                  <span>{t("financeiro.cad.classes")}</span>
                  <select value={lClasse} onChange={(e) => setLClasse(e.target.value)}>
                    <option value="">{t("financeiro.form.semClasse")}</option>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
                  </select>
                </label>
                <label className="fin-field">
                  <span>{t("financeiro.cad.centros")}</span>
                  <select value={lCentro} onChange={(e) => setLCentro(e.target.value)}>
                    <option value="">{t("financeiro.form.semCentro")}</option>
                    {centrosSelecionaveis.map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
                  </select>
                </label>
                <label className="fin-field fin-field-narrow">
                  <span>%</span>
                  <input type="number" step="0.01" min="0" value={lPct} disabled={tipoRateio === "valor"} onChange={(e) => onLinhaPct(e.target.value)} />
                </label>
                <label className="fin-field fin-field-narrow">
                  <span>{t("financeiro.manual.valorApropriacao")}</span>
                  <input type="number" step="0.01" min="0" value={lValor} disabled={tipoRateio === "percentual"} onChange={(e) => onLinhaValor(e.target.value)} />
                </label>
                <button type="button" className="btn-secondary btn-small fin-manual-add" onClick={adicionar} title={t("financeiro.rateio.adicionar")}>+</button>
              </div>

              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>{t("financeiro.cad.classes")}</th>
                      <th>{t("financeiro.cad.centros")}</th>
                      <th className="fin-num">%</th>
                      <th className="fin-num">{t("financeiro.col.valor")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.length === 0 ? (
                      <tr><td colSpan={5} className="fin-empty">{t("financeiro.manual.semRateio")}</td></tr>
                    ) : (
                      itens.map((it, idx) => (
                        <tr key={idx}>
                          <td>{comCodigo(catById[it.categoryId]) || "-"}</td>
                          <td>{comCodigo(centroById[it.centroCustoId]) || "-"}</td>
                          <td className="fin-num">{it.pct}%</td>
                          <td className="fin-num">{formatCents(it.valorCents, lang)}</td>
                          <td className="fin-row-actions">
                            <button type="button" className="btn-ghost btn-small" onClick={() => remover(idx)} aria-label={t("common.remove")}>×</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {itens.length > 0 && (
                <div className={"fin-rateio-restante " + (restante === 0 ? "ok" : "pend")}>
                  {t("financeiro.rateio.restante")}: <strong>{formatCents(restante, lang)}</strong>
                  <span className="fin-rateio-base"> / {formatCents(baseCents, lang)}</span>
                </div>
              )}
            </fieldset>

            <div className="fin-modal-acoes">
              <button className="btn-primary btn-small" onClick={salvar} disabled={salvando || contasAtivas.length === 0}>
                {salvando ? t("common.loading") : t("financeiro.manual.salvar")}
              </button>
              <button className="btn-ghost btn-small" onClick={onClose}>{t("common.cancel")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
