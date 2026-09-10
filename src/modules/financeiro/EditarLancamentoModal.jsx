import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { reaisParaCents } from "./dinheiro.js";
import { comCodigo } from "./rotulo.js";
import SearchSelect from "./SearchSelect.jsx";

function IconEdit({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function IconInfo({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

const STATUS_ABERTOS = ["provisionado", "pendente", "disponivel"];

// Editar um lançamento já existente - não existia em lugar nenhum do app (só
// criação). Descrição/Documento/Observação/Categoria/Centro/Contato sempre
// editáveis; Valor/Tipo/Vencimento só quando o título ainda está aberto (mesma
// regra que o servidor já aplica em PATCH /lancamentos/:id - campo desabilitado
// aqui, não escondido, pra explicar por que em vez de só recusar depois).
export default function EditarLancamentoModal({ lancamento, onClose, onSalvo }) {
  const { t } = useTranslation();
  const aberto = STATUS_ABERTOS.includes(lancamento.status);

  const [categorias, setCategorias] = useState([]);
  const [centros, setCentros] = useState([]);
  const [contatos, setContatos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [descricao, setDescricao] = useState(lancamento.descricao || "");
  const [doc, setDoc] = useState(lancamento.doc || "");
  const [observacao, setObservacao] = useState(lancamento.observacao || "");
  const [categoryId, setCategoryId] = useState(lancamento.category_id || "");
  const [centroCustoId, setCentroCustoId] = useState(lancamento.centro_custo_id || "");
  const [contatoId, setContatoId] = useState(lancamento.contato_id || "");
  const [contraparte, setContraparte] = useState(lancamento.contraparte || "");
  const [tipo, setTipo] = useState(lancamento.tipo);
  const [valor, setValor] = useState(String((lancamento.valor_cents || 0) / 100));
  const [due, setDue] = useState(lancamento.due || "");

  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [cats, ccs, cts] = await Promise.all([api.finListCategorias("pt"), api.finListCentrosCusto(), api.finListContatos()]);
        setCategorias(cats); setCentros(ccs); setContatos(cts);
      } catch (e) {
        setErro(translateError(e, t));
      } finally {
        setCarregando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const centrosSelecionaveis = useMemo(() => centros.filter((c) => c.tipo !== "sintetico" && c.ativo === 1), [centros]);
  const contatoOpts = useMemo(() => contatos.map((c) => ({ id: c.id, label: c.nome })), [contatos]);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    const dados = {
      descricao: descricao.trim(), doc: doc.trim(), observacao: observacao.trim(),
      categoryId: categoryId || null, centroCustoId: centroCustoId || null,
      contatoId: contatoId || null, contraparte: contraparte.trim(),
    };
    if (aberto) {
      const valorCents = reaisParaCents(valor);
      if (!valorCents || valorCents <= 0) { setErro(t("financeiro.form.valorInvalido")); return; }
      if (!due) { setErro(t("financeiro.manual.informeData")); return; }
      Object.assign(dados, { tipo, valorCents, due });
    }
    setSalvando(true);
    try {
      await api.finUpdateLancamento(lancamento.id, dados);
      onSalvo?.();
      onClose();
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal contato-form-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        <div className="cobr-form-header">
          <span className="cobr-form-header-icon"><IconEdit size={20} /></span>
          <div>
            <h2 className="cobr-form-title">{t("financeiro.movimentacao.editar.titulo")}</h2>
            <p className="cobr-form-subtitle">
              {aberto ? t("financeiro.movimentacao.editar.subtituloAberto") : t("financeiro.movimentacao.editar.subtituloTravado")}
            </p>
          </div>
        </div>

        {carregando ? (
          <div className="fin-loading">{t("common.loading")}</div>
        ) : (
          <form className="cobr-form-body" onSubmit={salvar}>
            <label className="cobr-field">
              <span>{t("financeiro.col.descricao")}</span>
              <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </label>

            <div className="cobr-form-grid">
              <label className="cobr-field">
                <span>{t("financeiro.cad.tipo")}</span>
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={!aberto} title={!aberto ? t("financeiro.movimentacao.editar.travadoHint") : undefined}>
                  <option value="receber">{t("financeiro.movimentacao.entrada")}</option>
                  <option value="pagar">{t("financeiro.movimentacao.saida")}</option>
                </select>
              </label>
              <label className="cobr-field">
                <span>{t("financeiro.col.valor")}</span>
                <span className="cobr-valor-wrap">
                  <span className="cobr-valor-prefixo">R$</span>
                  <input
                    type="text" inputMode="decimal" value={valor} disabled={!aberto}
                    title={!aberto ? t("financeiro.movimentacao.editar.travadoHint") : undefined}
                    onChange={(e) => setValor(e.target.value)}
                  />
                </span>
              </label>
              <label className="cobr-field">
                <span>{t("financeiro.mov.dataFim")}</span>
                <input type="date" value={due} disabled={!aberto} title={!aberto ? t("financeiro.movimentacao.editar.travadoHint") : undefined} onChange={(e) => setDue(e.target.value)} />
              </label>
            </div>

            <div className="cobr-form-grid">
              <label className="cobr-field">
                <span>{t("financeiro.cad.classes")}</span>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">{t("financeiro.form.semClasse")}</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
                </select>
              </label>
              <label className="cobr-field">
                <span>{t("financeiro.cad.centros")}</span>
                <select value={centroCustoId} onChange={(e) => setCentroCustoId(e.target.value)}>
                  <option value="">{t("financeiro.form.semCentro")}</option>
                  {centrosSelecionaveis.map((c) => <option key={c.id} value={c.id}>{comCodigo(c)}</option>)}
                </select>
              </label>
            </div>

            <label className="cobr-field">
              <span>{t("financeiro.col.contraparte")}</span>
              <SearchSelect value={contatoId} onChange={setContatoId} options={contatoOpts} allLabel={t("financeiro.baixa.semConta")} />
            </label>
            {!contatoId && (
              <label className="cobr-field">
                <span>{t("financeiro.movimentacao.editar.contraparteLivre")}</span>
                <input type="text" value={contraparte} onChange={(e) => setContraparte(e.target.value)} />
              </label>
            )}

            <label className="cobr-field">
              <span>{t("financeiro.tit.observacao")}</span>
              <textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </label>
            <label className="cobr-field">
              <span>{t("financeiro.tit.docNumero")}</span>
              <input type="text" value={doc} onChange={(e) => setDoc(e.target.value)} />
            </label>

            {erro && <p className="cobr-form-erro"><IconInfo /> {erro}</p>}

            <div className="cobr-form-footer">
              <button type="button" className="recurrence-btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
              <button type="submit" className="recurrence-btn-primary" disabled={salvando}>
                {salvando ? t("common.loading") : t("common.save")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
