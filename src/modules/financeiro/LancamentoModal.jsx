import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents, reaisParaCents, centsOuZero } from "./dinheiro.js";
import { comCodigo } from "./rotulo.js";

// Formas de pagamento (conjunto fixo por ora; o SIGIM tem cadastro próprio). A
// chave é gravada; o rótulo é traduzido em financeiro.forma.*.
const FORMAS = ["operacao_bancaria", "pix", "boleto", "transferencia", "dinheiro", "cheque", "cartao"];

// Detalhe do título, no espírito da tela do SIGIM: cabeçalho (nº, correntista +
// documento, situação), identificação/documento, valores (com líquido) e, quando
// baixado, os detalhes do pagamento. Os campos de imposto/desconto/retenção
// aparecem como placeholder - entram de fato no bloco de impostos (fase seguinte).
export default function LancamentoModal({ lancamento, categorias, centros, contatos, contas, todos = [], onClose, onChanged }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();
  const l = lancamento;
  const pago = l.status === "pago";

  const [f, setF] = useState({
    tipo: l.tipo,
    descricao: l.descricao || "",
    doc: l.doc || "",
    valor: String((l.valor_cents || 0) / 100),
    due: l.due,
    emissao: l.emissao || "",
    formaPagto: l.forma_pagto || "",
    observacao: l.observacao || "",
    impostoRetido: l.imposto_retido_cents ? String(l.imposto_retido_cents / 100) : "",
    impostoAcrescido: l.imposto_acrescido_cents ? String(l.imposto_acrescido_cents / 100) : "",
    desconto: l.desconto_cents ? String(l.desconto_cents / 100) : "",
    retencao: l.retencao_cents ? String(l.retencao_cents / 100) : "",
    multa: l.multa_cents ? String(l.multa_cents / 100) : "",
    juros: l.juros_cents ? String(l.juros_cents / 100) : "",
    categoryId: l.category_id || "",
    centroCustoId: l.centro_custo_id || "",
    contatoId: l.contato_id || "",
  });
  const [contaBaixa, setContaBaixa] = useState(l.conta_id || contas.find((c) => c.ativo === 1)?.id || "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const correntista = useMemo(() => contatos.find((c) => c.id === f.contatoId) || null, [contatos, f.contatoId]);
  const contaPagto = useMemo(() => contas.find((c) => c.id === l.conta_id) || null, [contas, l.conta_id]);
  // Líquido = título - desconto - imposto retido - retenção + acrescido (nunca < 0).
  // Calculado ao vivo, no mesmo espírito do servidor (liquidoCents).
  const valorLiquido = useMemo(() => {
    const bruto = reaisParaCents(f.valor) || 0;
    const liq = bruto - centsOuZero(f.desconto) - centsOuZero(f.impostoRetido) - centsOuZero(f.retencao)
      + centsOuZero(f.impostoAcrescido) + centsOuZero(f.multa) + centsOuZero(f.juros);
    return Math.max(0, liq);
  }, [f.valor, f.desconto, f.impostoRetido, f.retencao, f.impostoAcrescido, f.multa, f.juros]);

  // Vínculos: título-pai (se este foi gerado) e títulos de imposto que este gerou.
  const pai = useMemo(() => (l.titulo_origem_id ? todos.find((x) => x.id === l.titulo_origem_id) : null), [l.titulo_origem_id, todos]);
  const filhos = useMemo(() => todos.filter((x) => x.titulo_origem_id === l.id), [todos, l.id]);

  async function salvar() {
    setErro("");
    const valorCents = reaisParaCents(f.valor);
    if (!valorCents) return setErro(t("financeiro.form.valorInvalido"));
    setSalvando(true);
    try {
      await api.finUpdateLancamento(l.id, {
        tipo: f.tipo, descricao: f.descricao.trim(), doc: f.doc.trim(), valorCents, due: f.due,
        emissao: f.emissao || null, formaPagto: f.formaPagto, observacao: f.observacao,
        impostoRetidoCents: centsOuZero(f.impostoRetido), impostoAcrescidoCents: centsOuZero(f.impostoAcrescido),
        descontoCents: centsOuZero(f.desconto), retencaoCents: centsOuZero(f.retencao),
        multaCents: centsOuZero(f.multa), jurosCents: centsOuZero(f.juros),
        categoryId: f.categoryId || null, centroCustoId: f.centroCustoId || null, contatoId: f.contatoId || null,
      });
      showToast(t("financeiro.toast.salvo"));
      onChanged();
    } catch (e) {
      setErro(translateError(e, t));
    } finally {
      setSalvando(false);
    }
  }
  async function baixar() {
    try { await api.finBaixarLancamento(l.id, { contaId: contaBaixa || undefined }); showToast(t("financeiro.toast.baixado")); onChanged(); } catch (e) { setErro(translateError(e, t)); }
  }
  async function estornar() {
    try { await api.finEstornarLancamento(l.id); onChanged(); } catch (e) { setErro(translateError(e, t)); }
  }
  async function excluir() {
    if (!confirm(t("financeiro.confirm.excluir"))) return;
    try { await api.finDeleteLancamento(l.id); showToast(t("financeiro.toast.excluido")); onChanged(); } catch (e) { setErro(translateError(e, t)); }
  }

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
            <select value={f.contatoId} onChange={(e) => setF({ ...f, contatoId: e.target.value })}>
              <option value="">{t("financeiro.form.semContato")}</option>
              {contatos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <span className="fin-tit-doc-correntista">{correntista?.doc || " "}</span>
          </label>
          <div className="fin-tit-situacao">
            <span>{t("financeiro.col.status")}</span>
            <span className={"fin-badge fin-badge-" + l.status}>{t("financeiro.status." + l.status)}</span>
          </div>
        </div>

        <div className="modal-body fin-modal-body">
          {/* Vínculos de imposto */}
          {pai && (
            <div className="fin-vinculo fin-vinculo-filho">
              {t("financeiro.tit.geradoDe", { n: pai.numero })}
            </div>
          )}
          {filhos.length > 0 && (
            <div className="fin-vinculo fin-vinculo-pai">
              {t("financeiro.tit.gerou", { n: filhos.map((x) => x.numero).join(", ") })}
            </div>
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
                <select value={f.centroCustoId} onChange={(e) => setF({ ...f, centroCustoId: e.target.value })}>
                  <option value="">{t("financeiro.form.semCentro")}</option>
                  {centros.map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
                </select>
              </label>
            </div>
          </fieldset>

          {/* Valores. Impostos/desconto/retenção ainda não calculam - placeholder. */}
          <fieldset className="fin-bloco">
            <legend>{t("financeiro.tit.valores")}</legend>
            <div className="fin-modal-grid">
              <label className="fin-field">
                <span>{t("financeiro.tit.valorTitulo")}</span>
                <input type="number" step="0.01" min="0" value={f.valor} disabled={pago} onChange={(e) => setF({ ...f, valor: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.impostosRetidos")}</span>
                <input type="number" step="0.01" min="0" value={f.impostoRetido} disabled={pago} placeholder="0,00" onChange={(e) => setF({ ...f, impostoRetido: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.impostosAcrescidos")}</span>
                <input type="number" step="0.01" min="0" value={f.impostoAcrescido} disabled={pago} placeholder="0,00" onChange={(e) => setF({ ...f, impostoAcrescido: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.desconto")}</span>
                <input type="number" step="0.01" min="0" value={f.desconto} disabled={pago} placeholder="0,00" onChange={(e) => setF({ ...f, desconto: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.retencao")}</span>
                <input type="number" step="0.01" min="0" value={f.retencao} disabled={pago} placeholder="0,00" onChange={(e) => setF({ ...f, retencao: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.multa")}</span>
                <input type="number" step="0.01" min="0" value={f.multa} disabled={pago} placeholder="0,00" onChange={(e) => setF({ ...f, multa: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>{t("financeiro.tit.juros")}</span>
                <input type="number" step="0.01" min="0" value={f.juros} disabled={pago} placeholder="0,00" onChange={(e) => setF({ ...f, juros: e.target.value })} />
              </label>
              <div className="fin-field fin-tit-liquido">
                <span>{t("financeiro.tit.valorLiquido")}</span>
                <strong>{formatCents(valorLiquido, lang)}</strong>
              </div>
            </div>
          </fieldset>

          <label className="fin-field">
            <span>{t("financeiro.tit.observacao")}</span>
            <textarea rows={2} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} />
          </label>

          {/* Detalhes do pagamento - só quando baixado */}
          {pago && (
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
            {!pago ? (
              <span className="fin-baixa-inline">
                <select value={contaBaixa} onChange={(e) => setContaBaixa(e.target.value)}>
                  <option value="">{t("financeiro.baixa.semConta")}</option>
                  {contas.filter((c) => c.ativo === 1).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <button className="btn-secondary btn-small" onClick={baixar}>{t("financeiro.acao.baixar")}</button>
              </span>
            ) : (
              <button className="btn-secondary btn-small" onClick={estornar}>{t("financeiro.acao.estornar")}</button>
            )}
            <button className="btn-danger btn-small fin-modal-excluir" onClick={excluir}>{t("financeiro.acao.excluir")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
