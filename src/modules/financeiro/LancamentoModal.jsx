import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents, formatPercent, reaisParaCents, centsOuZero } from "./dinheiro.js";
import { comCodigo } from "./rotulo.js";
import SearchSelect from "./SearchSelect.jsx";

// Formas de pagamento (conjunto fixo por ora; o SIGIM tem cadastro próprio). A
// chave é gravada; o rótulo é traduzido em financeiro.forma.*. Exportado para o
// formulário de novo título (LancamentosView) usar a mesma lista.
export const FORMAS = ["operacao_bancaria", "pix", "boleto", "transferencia", "dinheiro", "cheque", "cartao"];

// Detalhe do título: cabeçalho (nº, correntista + documento, situação),
// identificação/documento, apropriação, valores (com líquido e os impostos
// aplicados do cadastro), observação e, quando baixado, os detalhes do
// pagamento (só leitura). A BAIXA EM SI não acontece aqui - fica na aba
// Movimentação, de propósito: lançar/editar o título é uma tela diferente de
// onde o dinheiro de fato se move, no mesmo espírito do SIGIM.
//
// impostosCadastro é a lista de impostos.js (financeiro_impostos, com
// alíquota); onRefreshList atualiza a lista do título na tela de trás SEM
// fechar o modal - aplicar/remover imposto precisa disso, porque fechar a cada
// clique tornaria impossível aplicar mais de um imposto seguido.
export default function LancamentoModal({ lancamento, categorias, centros, contatos, contas, impostosCadastro = [], todos = [], onClose, onChanged, onRefreshList }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();
  const l = lancamento;
  // Ciclo de situação: "aberto" (provisionado/pendente/disponivel) é editável e
  // apto a baixa/imposto/desdobramento; finalizado e anulado travam os campos.
  const finalizado = l.status === "finalizado";
  const anulado = l.status === "anulado";
  const aberto = l.status === "provisionado" || l.status === "pendente" || l.status === "disponivel";
  const travado = !aberto; // finalizado ou anulado: sem edição de valores/encargos

  const [f, setF] = useState({
    tipo: l.tipo,
    descricao: l.descricao || "",
    doc: l.doc || "",
    valor: String((l.valor_cents || 0) / 100),
    due: l.due,
    emissao: l.emissao || "",
    formaPagto: l.forma_pagto || "",
    observacao: l.observacao || "",
    desconto: l.desconto_cents ? String(l.desconto_cents / 100) : "",
    retencao: l.retencao_cents ? String(l.retencao_cents / 100) : "",
    multa: l.multa_cents ? String(l.multa_cents / 100) : "",
    juros: l.juros_cents ? String(l.juros_cents / 100) : "",
    categoryId: l.category_id || "",
    centroCustoId: l.centro_custo_id || "",
    contatoId: l.contato_id || "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false);
  // Desdobramento
  const [abrirParcelas, setAbrirParcelas] = useState(false);
  const [nParcelas, setNParcelas] = useState(2);
  const [intervalo, setIntervalo] = useState(1);
  // Impostos aplicados: totais em estado próprio (não em `f`) porque são
  // derivados do servidor, não digitados - atualizam a cada aplicar/remover
  // sem depender de um recarregar da tela inteira.
  const [aplicados, setAplicados] = useState([]);
  const [totalRetido, setTotalRetido] = useState(l.imposto_retido_cents || 0);
  const [totalAcrescido, setTotalAcrescido] = useState(l.imposto_acrescido_cents || 0);
  const [impostoEscolhido, setImpostoEscolhido] = useState("");
  const [aplicando, setAplicando] = useState(false);
  // Rateio por centro de custo. Linhas editáveis {centroCustoId, valor, pct} - valor
  // e pct andam juntos (digitar um recalcula o outro contra o valor do título). O
  // servidor guarda só o valor em centavos; o pct é derivado. rateioAtivo liga a
  // seção; quando desligada, o centro único volta a valer.
  const [rateioAtivo, setRateioAtivo] = useState(false);
  const [rateio, setRateio] = useState([]);
  // Só sabemos o estado real do rateio se a carga do servidor deu certo. Sem essa
  // marca, uma falha transitória no GET (catch silencioso abaixo) deixaria
  // rateioAtivo=false e o salvar apagaria o rateio salvo (finDefinirApropriacoes []).
  const [rateioCarregado, setRateioCarregado] = useState(false);

  useEffect(() => {
    api.finListImpostosAplicados(l.id).then(setAplicados).catch(() => {});
    api.finListApropriacoes(l.id).then((rows) => {
      if (rows.length) {
        const base = l.valor_cents || 0;
        setRateio(rows.map((r) => ({
          centroCustoId: r.centro_custo_id,
          valor: String(r.valor_cents / 100),
          pct: base ? String(Math.round((r.valor_cents / base) * 10000) / 100) : "",
        })));
        setRateioAtivo(true);
      }
      setRateioCarregado(true);
    }).catch(() => { /* falhou: rateioCarregado fica false, o salvar não mexe no rateio */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l.id]);

  const correntista = useMemo(() => contatos.find((c) => c.id === f.contatoId) || null, [contatos, f.contatoId]);
  const contatoOpts = useMemo(() => contatos.map((c) => ({ id: c.id, label: c.nome })), [contatos]);
  const contaPagto = useMemo(() => contas.find((c) => c.id === l.conta_id) || null, [contas, l.conta_id]);
  // Centros selecionáveis: só analítico ativo recebe lançamento. Mantém o centro
  // já gravado neste título na lista mesmo que hoje seja sintético/inativo, para o
  // valor não sumir do select ao reabrir um título antigo.
  const centrosSelecionaveis = useMemo(() => {
    const base = centros.filter((c) => c.tipo !== "sintetico" && c.ativo === 1);
    if (f.centroCustoId && !base.some((c) => c.id === f.centroCustoId)) {
      const atual = centros.find((c) => c.id === f.centroCustoId);
      if (atual) return [atual, ...base];
    }
    return base;
  }, [centros, f.centroCustoId]);
  // Impostos do cadastro que ainda não foram aplicados neste título - não faz
  // sentido oferecer o mesmo imposto duas vezes (o servidor também recusa).
  const impostosDisponiveis = useMemo(
    () => impostosCadastro.filter((i) => i.ativo === 1 && !aplicados.some((a) => a.imposto_id === i.id)),
    [impostosCadastro, aplicados]
  );

  // Líquido = título - desconto - impostos retidos - retenção + impostos
  // acrescidos + multa + juros (nunca < 0). Mesma fórmula do servidor
  // (liquidoCents), só que ao vivo, na tela.
  const valorLiquido = useMemo(() => {
    const bruto = reaisParaCents(f.valor) || 0;
    const liq = bruto - centsOuZero(f.desconto) - totalRetido - centsOuZero(f.retencao)
      + totalAcrescido + centsOuZero(f.multa) + centsOuZero(f.juros);
    return Math.max(0, liq);
  }, [f.valor, f.desconto, f.retencao, f.multa, f.juros, totalRetido, totalAcrescido]);

  // Base do rateio = valor do título (bruto). As linhas se apoiam nela para
  // converter % em valor e vice-versa, e o "restante" mostra o que falta fechar.
  const baseRateioCents = reaisParaCents(f.valor) || 0;
  const rateioSomaCents = useMemo(() => rateio.reduce((s, r) => s + (reaisParaCents(r.valor) || 0), 0), [rateio]);
  const rateioRestanteCents = baseRateioCents - rateioSomaCents;
  // Centros já escolhidos noutras linhas: não oferecer o mesmo duas vezes.
  const centroUsado = (idx) => new Set(rateio.filter((_, i) => i !== idx).map((r) => r.centroCustoId).filter(Boolean));

  function addLinha() { setRateio((rs) => [...rs, { centroCustoId: "", valor: "", pct: "" }]); }
  function removeLinha(idx) { setRateio((rs) => rs.filter((_, i) => i !== idx)); }
  function setLinha(idx, patch) { setRateio((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r))); }
  // Digitar o VALOR recalcula o %, e digitar o % recalcula o valor - sempre contra
  // a base. Guardo as duas strings para o campo não "pular" ao digitar.
  function onValor(idx, valorStr) {
    const cents = reaisParaCents(valorStr) || 0;
    const pct = baseRateioCents ? String(Math.round((cents / baseRateioCents) * 10000) / 100) : "";
    setLinha(idx, { valor: valorStr, pct });
  }
  function onPct(idx, pctStr) {
    const pct = Number(String(pctStr).replace(",", ".")) || 0;
    const cents = Math.round((baseRateioCents * pct) / 100);
    setLinha(idx, { pct: pctStr, valor: cents ? String(cents / 100) : "" });
  }
  function ligarRateio() {
    setRateioAtivo(true);
    // Ao ligar, semeia com uma linha já apontando para o centro único (se houver).
    if (rateio.length === 0) setRateio([{ centroCustoId: f.centroCustoId || "", valor: "", pct: "" }]);
  }
  function desligarRateio() { setRateioAtivo(false); setRateio([]); }

  // Vínculos: título-pai (se este foi gerado) e filhos (imposto ou parcelas).
  const pai = useMemo(() => (l.titulo_origem_id ? todos.find((x) => x.id === l.titulo_origem_id) : null), [l.titulo_origem_id, todos]);
  const filhos = useMemo(() => todos.filter((x) => x.titulo_origem_id === l.id), [todos, l.id]);
  const impostoFilhos = filhos.filter((x) => x.origem === "imposto_aplicado");
  const parcelaFilhos = filhos.filter((x) => x.origem === "parcela");

  const temImposto = totalRetido > 0 || totalAcrescido > 0;

  async function salvar() {
    setErro("");
    const valorCents = reaisParaCents(f.valor);
    if (!valorCents) return setErro(t("financeiro.form.valorInvalido"));
    // Monta e valida o rateio (quando ligado) ANTES de tocar no servidor - feedback
    // imediato; o servidor revalida de qualquer forma.
    let itensRateio = null;
    if (rateioAtivo) {
      const itens = rateio.map((r) => ({ centroCustoId: r.centroCustoId, valorCents: reaisParaCents(r.valor) || 0 }));
      if (itens.some((it) => !it.centroCustoId)) return setErro(t("financeiro.rateio.escolhaCentro"));
      if (itens.some((it) => !it.valorCents || it.valorCents <= 0)) return setErro(t("financeiro.rateio.valorInvalido"));
      if (new Set(itens.map((it) => it.centroCustoId)).size !== itens.length) return setErro(t("financeiro.rateio.duplicado"));
      if (itens.reduce((s, it) => s + it.valorCents, 0) !== valorCents) return setErro(t("financeiro.rateio.naoFecha"));
      itensRateio = itens;
    }
    setSalvando(true);
    try {
      await api.finUpdateLancamento(l.id, {
        tipo: f.tipo, descricao: f.descricao.trim(), doc: f.doc.trim(), valorCents, due: f.due,
        emissao: f.emissao || null, formaPagto: f.formaPagto, observacao: f.observacao,
        descontoCents: centsOuZero(f.desconto), retencaoCents: centsOuZero(f.retencao),
        multaCents: centsOuZero(f.multa), jurosCents: centsOuZero(f.juros),
        // Rateado não tem centro único - o rateio manda. Sem rateio, vale o select.
        categoryId: f.categoryId || null, centroCustoId: rateioAtivo ? null : (f.centroCustoId || null), contatoId: f.contatoId || null,
      });
      // Grava (ou limpa) o rateio depois do título - a validação de soma no
      // servidor é contra o valor já salvo.
      // Com rateio ligado, grava o que o usuário montou. Desligado, só LIMPA se a
      // carga tinha dado certo (senão não sabemos se havia rateio - não apaga às
      // cegas).
      if (rateioAtivo) await api.finDefinirApropriacoes(l.id, itensRateio);
      else if (rateioCarregado) await api.finDefinirApropriacoes(l.id, []);
      showToast(t("financeiro.toast.salvo"));
      onChanged();
    } catch (e) {
      setErro(translateError(e, t));
    } finally {
      setSalvando(false);
    }
  }
  // Sem window.confirm: o navegador pode suprimir diálogos repetidos e cancelá-los
  // em silêncio (o botão parecia não fazer nada). A confirmação é inline, abaixo.
  async function excluir() {
    setConfirmandoExcluir(false);
    try { await api.finDeleteLancamento(l.id); showToast(t("financeiro.toast.excluido")); onChanged(); } catch (e) { setErro(translateError(e, t)); }
  }
  // Muda a situação entre os estados de aberto e o cancelamento. Finalizar é a
  // baixa (aba Movimentação) e sair de finalizado é o estorno - não passam por
  // aqui. onChanged fecha e recarrega a lista de trás.
  async function mudarStatus(novo) {
    setErro("");
    try {
      await api.finMudarStatus(l.id, novo);
      showToast(t("financeiro.toast.situacaoAlterada"));
      onChanged();
    } catch (e) { setErro(translateError(e, t)); }
  }
  async function anular() {
    if (!confirm(t("financeiro.confirm.anular"))) return;
    mudarStatus("anulado");
  }
  async function desdobrar() {
    setErro("");
    try {
      await api.finDesdobrarLancamento(l.id, { parcelas: Number(nParcelas), intervaloMeses: Number(intervalo) });
      showToast(t("financeiro.parcela.desdobrado", { n: nParcelas }));
      onChanged();
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  async function aplicarImposto() {
    if (!impostoEscolhido) return;
    setErro("");
    setAplicando(true);
    try {
      const r = await api.finAplicarImposto(l.id, impostoEscolhido);
      setAplicados(r.aplicados);
      setTotalRetido(r.titulo.imposto_retido_cents || 0);
      setTotalAcrescido(r.titulo.imposto_acrescido_cents || 0);
      setImpostoEscolhido("");
      showToast(t("financeiro.tit.impostoAplicado"));
      onRefreshList?.();
    } catch (e) {
      setErro(translateError(e, t));
    } finally {
      setAplicando(false);
    }
  }
  async function removerImposto(aplicadoId) {
    setErro("");
    try {
      const r = await api.finRemoverImpostoAplicado(l.id, aplicadoId);
      setAplicados(r.aplicados);
      setTotalRetido(r.titulo.imposto_retido_cents || 0);
      setTotalAcrescido(r.titulo.imposto_acrescido_cents || 0);
      onRefreshList?.();
    } catch (e) {
      setErro(translateError(e, t));
    }
  }

  // Elegível a desdobrar: pendente, não é parcela/imposto gerado, não parcelado
  // e sem encargos lançados (espelho da regra do servidor, só para
  // mostrar/esconder).
  const temEncargo = temImposto || centsOuZero(f.desconto) || centsOuZero(f.retencao) || centsOuZero(f.multa) || centsOuZero(f.juros);
  const podeDesdobrar = aberto && !l.origem && !l.parcela_total && !temEncargo;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-wide">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        {/* Cabeçalho: nº do título, correntista + documento, situação */}
        <div className="fin-tit-cab">
          <div className="fin-tit-num">
            <span className="fin-tit-num-label">{t("financeiro.tit.numero")}</span>
            <span className="fin-tit-num-value">{l.numero}</span>
          </div>
          <label className="fin-field fin-tit-correntista">
            <span>{t("financeiro.col.contraparte")}</span>
            <SearchSelect value={f.contatoId} onChange={(id) => setF({ ...f, contatoId: id })} options={contatoOpts} allLabel={t("financeiro.form.semContato")} />
            <span className="fin-tit-doc-correntista">{correntista?.doc || " "}</span>
          </label>
          <div className="fin-tit-situacao">
            <span>{t("financeiro.col.status")}</span>
            <span className={"fin-badge fin-badge-" + l.status}>{t("financeiro.status." + l.status)}</span>
            {l.parcela_total && <span className="fin-parcela-badge">{t("financeiro.parcela.xdeN", { x: l.parcela_num, n: l.parcela_total })}</span>}
            {/* Troca manual entre os estados de aberto; finalizar/estornar é na
                aba Movimentação. Anular tira o título do caixa e do DRE. */}
            {aberto && (
              <select className="fin-status-select" value={l.status} onChange={(e) => mudarStatus(e.target.value)}>
                <option value="provisionado">{t("financeiro.status.provisionado")}</option>
                <option value="pendente">{t("financeiro.status.pendente")}</option>
                <option value="disponivel">{t("financeiro.status.disponivel")}</option>
              </select>
            )}
            {aberto && <button type="button" className="btn-ghost btn-small" onClick={anular}>{t("financeiro.acao.anular")}</button>}
            {anulado && <button type="button" className="btn-ghost btn-small" onClick={() => mudarStatus("pendente")}>{t("financeiro.acao.reativar")}</button>}
          </div>
        </div>

        <div className="modal-body fin-modal-body">
          {/* Vínculos */}
          {pai && l.origem === "imposto_aplicado" && (
            <div className="fin-vinculo fin-vinculo-filho">{t("financeiro.tit.geradoDe", { n: pai.numero })}</div>
          )}
          {pai && l.origem === "parcela" && (
            <div className="fin-vinculo fin-vinculo-pai">{t("financeiro.parcela.deTitulo", { x: l.parcela_num, n: l.parcela_total, t: pai.numero })}</div>
          )}
          {impostoFilhos.length > 0 && (
            <div className="fin-vinculo fin-vinculo-pai">{t("financeiro.tit.gerou", { n: impostoFilhos.map((x) => x.numero).join(", ") })}</div>
          )}
          {l.parcela_total && parcelaFilhos.length > 0 && (
            <div className="fin-vinculo fin-vinculo-pai">{t("financeiro.parcela.parcelado", { n: l.parcela_total, nums: parcelaFilhos.map((x) => x.numero).join(", ") })}</div>
          )}

          {/* Identificação / Documento */}
          <fieldset className="fin-bloco">
            <legend>{t("financeiro.tit.identificacao")}</legend>
            <div className="fin-modal-grid">
              <label className="fin-field fin-field-wide">
                <span>{t("financeiro.col.descricao")}</span>
                <input type="text" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.docNumero")}</span>
                <input type="text" value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.emissao")}</span>
                <input type="date" value={f.emissao} onChange={(e) => setF({ ...f, emissao: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.col.vencimento")}</span>
                <input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.formaPagto")}</span>
                <select value={f.formaPagto} onChange={(e) => setF({ ...f, formaPagto: e.target.value })}>
                  <option value="">{t("financeiro.tit.semForma")}</option>
                  {FORMAS.map((k) => <option key={k} value={k}>{t("financeiro.forma." + k)}</option>)}
                </select>
              </label>
            </div>
          </fieldset>

          {/* Apropriação: classe e centro de custo */}
          <fieldset className="fin-bloco">
            <legend>{t("financeiro.tit.apropriacao")}</legend>
            <div className="fin-modal-grid">
              <label className="fin-field">
                <span>{t("financeiro.cad.classes")}</span>
                <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
                  <option value="">{t("financeiro.form.semClasse")}</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
                </select>
              </label>
              <label className="fin-field">
                <span>{t("financeiro.cad.centros")}</span>
                <select
                  value={f.centroCustoId} disabled={travado || rateioAtivo}
                  title={rateioAtivo ? t("financeiro.rateio.travadoPorRateio") : undefined}
                  onChange={(e) => setF({ ...f, centroCustoId: e.target.value })}
                >
                  <option value="">{rateioAtivo ? t("financeiro.rateio.rateadoLabel") : t("financeiro.form.semCentro")}</option>
                  {!rateioAtivo && centrosSelecionaveis.map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
                </select>
              </label>
            </div>

            {/* Rateio: divide o valor do título entre vários centros (% ou R$). */}
            <div className="fin-rateio">
              {!rateioAtivo ? (
                !travado && <button type="button" className="btn-ghost btn-small" onClick={ligarRateio}>{t("financeiro.rateio.ativar")}</button>
              ) : (
                <>
                  <div className="fin-rateio-head">
                    <span className="fin-rateio-titulo">{t("financeiro.rateio.titulo")}</span>
                    {!travado && <button type="button" className="btn-ghost btn-small" onClick={desligarRateio}>{t("financeiro.rateio.desativar")}</button>}
                  </div>
                  <div className="fin-rateio-cols">
                    <span>{t("financeiro.cad.centros")}</span>
                    <span>%</span>
                    <span>{t("financeiro.col.valor")}</span>
                    <span></span>
                  </div>
                  {rateio.map((r, idx) => {
                    const usados = centroUsado(idx);
                    const base = centrosSelecionaveis.filter((c) => !usados.has(c.id) || c.id === r.centroCustoId);
                    // Preserva o centro já gravado nesta linha mesmo que hoje seja
                    // inativo/sintético (não está em centrosSelecionaveis), senão o
                    // select apareceria em branco e re-salvar zeraria a apropriação.
                    const atual = r.centroCustoId && !base.some((c) => c.id === r.centroCustoId) ? centros.find((c) => c.id === r.centroCustoId) : null;
                    const opts = atual ? [atual, ...base] : base;
                    return (
                      <div className="fin-rateio-linha" key={idx}>
                        <select value={r.centroCustoId} disabled={travado} onChange={(e) => setLinha(idx, { centroCustoId: e.target.value })}>
                          <option value="">{t("financeiro.form.semCentro")}</option>
                          {opts.map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
                        </select>
                        <input type="number" step="0.01" min="0" placeholder="0" value={r.pct} disabled={travado} onChange={(e) => onPct(idx, e.target.value)} />
                        <input type="number" step="0.01" min="0" placeholder="0,00" value={r.valor} disabled={travado} onChange={(e) => onValor(idx, e.target.value)} />
                        {!travado && <button type="button" className="btn-ghost btn-small fin-rateio-x" onClick={() => removeLinha(idx)} aria-label={t("common.remove")}>×</button>}
                      </div>
                    );
                  })}
                  {!travado && <button type="button" className="btn-secondary btn-small" onClick={addLinha}>{t("financeiro.rateio.adicionar")}</button>}
                  <div className={"fin-rateio-restante " + (rateioRestanteCents === 0 ? "ok" : "pend")}>
                    {t("financeiro.rateio.restante")}: <strong>{formatCents(rateioRestanteCents, lang)}</strong>
                    <span className="fin-rateio-base"> / {formatCents(baseRateioCents, lang)}</span>
                  </div>
                </>
              )}
            </div>
          </fieldset>

          {/* Valores */}
          <fieldset className="fin-bloco">
            <legend>{t("financeiro.tit.valores")}</legend>
            <div className="fin-modal-grid">
              <label className="fin-field">
                <span>{t("financeiro.tit.valorTitulo")}</span>
                <input
                  type="number" step="0.01" min="0" value={f.valor} disabled={travado || temImposto}
                  title={temImposto ? t("financeiro.tit.valorTravadoImposto") : undefined}
                  onChange={(e) => setF({ ...f, valor: e.target.value })}
                />
              </label>
              <div className="fin-field">
                <span>{t("financeiro.tit.impostosRetidos")}</span>
                <strong>{formatCents(totalRetido, lang)}</strong>
              </div>
              <div className="fin-field">
                <span>{t("financeiro.tit.impostosAcrescidos")}</span>
                <strong>{formatCents(totalAcrescido, lang)}</strong>
              </div>
              <label className="fin-field">
                <span>{t("financeiro.tit.desconto")}</span>
                <input type="number" step="0.01" min="0" value={f.desconto} disabled={travado} placeholder="0,00" onChange={(e) => setF({ ...f, desconto: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.retencao")}</span>
                <input type="number" step="0.01" min="0" value={f.retencao} disabled={travado} placeholder="0,00" onChange={(e) => setF({ ...f, retencao: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.multa")}</span>
                <input type="number" step="0.01" min="0" value={f.multa} disabled={travado} placeholder="0,00" onChange={(e) => setF({ ...f, multa: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.juros")}</span>
                <input type="number" step="0.01" min="0" value={f.juros} disabled={travado} placeholder="0,00" onChange={(e) => setF({ ...f, juros: e.target.value })} />
              </label>
              <div className="fin-field fin-tit-liquido">
                <span>{t("financeiro.tit.valorLiquido")}</span>
                <strong>{formatCents(valorLiquido, lang)}</strong>
              </div>
            </div>
          </fieldset>

          {/* Impostos aplicados: do cadastro, com alíquota calculada e o título de recolhimento gerado */}
          <fieldset className="fin-bloco">
            <legend>{t("financeiro.tit.impostosAplicados")}</legend>
            {aplicados.length === 0 ? (
              <p className="fin-cad-hint">{t("financeiro.tit.semImpostoAplicado")}</p>
            ) : (
              <ul className="fin-imposto-lista">
                {aplicados.map((a) => (
                  <li key={a.id} className="fin-imposto-linha">
                    <span className="fin-imposto-nome">
                      {a.imposto_nome}
                      <span className={"fin-badge-tipo-" + a.tipo}>{t(`financeiro.cad.imposto_tipo_${a.tipo}`)}</span>
                    </span>
                    <span className="fin-num">{formatPercent(a.aliquota_centesimos, lang)}</span>
                    <span className="fin-num">{formatCents(a.valor_cents, lang)}</span>
                    {a.titulo_gerado_id && (
                      <span className="fin-imposto-gerado">{t("financeiro.tit.recolhimento")}</span>
                    )}
                    {aberto && (
                      <button type="button" className="btn-ghost btn-small" onClick={() => removerImposto(a.id)}>&times;</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {aberto && l.origem !== "imposto_aplicado" && (
              <div className="fin-imposto-adicionar">
                <select value={impostoEscolhido} onChange={(e) => setImpostoEscolhido(e.target.value)}>
                  <option value="">{t("financeiro.tit.escolherImposto")}</option>
                  {impostosDisponiveis.map((i) => (
                    <option key={i.id} value={i.id}>{i.nome} ({formatPercent(i.aliquota_centesimos, lang)})</option>
                  ))}
                </select>
                <button type="button" className="btn-secondary btn-small" onClick={aplicarImposto} disabled={!impostoEscolhido || aplicando}>
                  {t("financeiro.tit.aplicarImposto")}
                </button>
              </div>
            )}
          </fieldset>

          <label className="fin-field">
            <span>{t("financeiro.tit.observacao")}</span>
            <textarea rows={2} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} />
          </label>

          {/* Detalhes do pagamento - só quando baixado (finalizado) */}
          {finalizado && (
            <fieldset className="fin-bloco fin-bloco-pagto">
              <legend>{t("financeiro.tit.detalhesPagto")}</legend>
              <div className="fin-modal-grid">
                <div className="fin-field"><span>{t("financeiro.tit.dataBaixa")}</span><strong>{l.paid_at || "-"}</strong></div>
                <div className="fin-field"><span>{t("financeiro.contas.nome")}</span><strong>{contaPagto ? `${contaPagto.nome}${contaPagto.banco ? " (" + contaPagto.banco + ")" : ""}` : "-"}</strong></div>
                <div className="fin-field"><span>{t("financeiro.tit.valorPago")}</span><strong>{formatCents(valorLiquido, lang)}</strong></div>
              </div>
            </fieldset>
          )}

          {erro && <div className="fin-error">{erro}</div>}

          <div className="fin-modal-acoes">
            <button className="btn-primary btn-small" onClick={salvar} disabled={salvando}>{t("common.save")}</button>
            {finalizado && <span className="fin-modal-info">{t("financeiro.tit.baixaEmMovimentacao")}</span>}
            {confirmandoExcluir ? (
              <span className="fin-cc-confirm fin-modal-excluir">
                <span className="fin-cc-confirm-txt">{t("financeiro.cad.confirmar")}</span>
                <button type="button" className="btn-danger btn-small" onClick={excluir}>{t("financeiro.cad.sim")}</button>
                <button type="button" className="btn-ghost btn-small" onClick={() => setConfirmandoExcluir(false)}>{t("financeiro.cad.nao")}</button>
              </span>
            ) : (
              <button type="button" className="btn-danger btn-small fin-modal-excluir" onClick={() => setConfirmandoExcluir(true)}>{t("financeiro.acao.excluir")}</button>
            )}
          </div>

          {/* Desdobramento em parcelas */}
          {podeDesdobrar && (
            <div className="fin-desdobrar">
              {!abrirParcelas ? (
                <button className="btn-ghost btn-small" onClick={() => setAbrirParcelas(true)}>{t("financeiro.parcela.botao")}</button>
              ) : (
                <div className="fin-desdobrar-form">
                  <label>{t("financeiro.parcela.qtd")}
                    <input type="number" min="2" max="120" value={nParcelas} onChange={(e) => setNParcelas(e.target.value)} />
                  </label>
                  <label>{t("financeiro.parcela.intervalo")}
                    <input type="number" min="1" max="12" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
                  </label>
                  <button className="btn-primary btn-small" onClick={desdobrar}>{t("financeiro.parcela.confirmar")}</button>
                  <button className="btn-ghost btn-small" onClick={() => setAbrirParcelas(false)}>&times;</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
