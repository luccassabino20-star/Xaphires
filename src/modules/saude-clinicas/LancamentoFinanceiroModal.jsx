import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { reaisParaCents } from "../financeiro/dinheiro.js";
import { hojeCivil } from "./agendaUtils.js";

// Lançamento direto (já realizado) - sem estado provisionado/baixa, ao
// contrário do módulo Financeiro de verdade: o pedido descreveu botões "+
// Receita/+ Despesa/+ Transferência" que lançam na hora.
export default function LancamentoFinanceiroModal({ tipo, contaPreselecionada, onClose, onSaved }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [centros, setCentros] = useState([]);
  const [convenios, setConvenios] = useState([]);
  const [procedimentos, setProcedimentos] = useState([]);

  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeCivil());
  const [contaId, setContaId] = useState(contaPreselecionada || "");
  const [contaDestinoId, setContaDestinoId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [centroCustoId, setCentroCustoId] = useState("");
  const [convenioId, setConvenioId] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.scFinListContas().then((cs) => {
      setContas(cs);
      if (!contaPreselecionada && cs[0]) setContaId(cs[0].id);
    });
    if (tipo !== "transferencia") api.scFinListCategorias(tipo).then(setCategorias);
    api.scFinListCentrosCusto().then(setCentros);
    if (tipo === "receita") {
      api.scListInsurancePlans().then(setConvenios).catch(() => setConvenios([]));
      api.scListProcedures().then(setProcedimentos).catch(() => setProcedimentos([]));
    }
    // eslint-disable-next-line
  }, [tipo]);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    const valorCents = reaisParaCents(valor);
    if (!valorCents) return setErro(t("saudeClinicas.financeiro.lanc.valorInvalido"));
    if (!contaId) return setErro(t("saudeClinicas.financeiro.lanc.contaObrigatoria"));
    if (tipo === "transferencia" && (!contaDestinoId || contaDestinoId === contaId)) {
      return setErro(t("saudeClinicas.financeiro.lanc.destinoInvalido"));
    }
    setSalvando(true);
    try {
      await api.scFinCreateLancamento({
        tipo, descricao: descricao.trim(), valorCents, data, contaId,
        contaDestinoId: tipo === "transferencia" ? contaDestinoId : undefined,
        categoriaId: categoriaId || undefined, centroCustoId: centroCustoId || undefined,
        convenioId: tipo === "receita" ? convenioId || undefined : undefined,
        procedureId: tipo === "receita" ? procedureId || undefined : undefined,
      });
      showToast(t("saudeClinicas.financeiro.lanc.criado"));
      onSaved();
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sc-fin-lanc-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
        <h3 className="sc-config-title">{t(`saudeClinicas.financeiro.lanc.titulo.${tipo}`)}</h3>

        <form className="sc-fin-lanc-form" onSubmit={salvar}>
          <label className="fin-field fin-field-wide">
            <span>{t("saudeClinicas.financeiro.lanc.descricao")}</span>
            <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </label>

          <div className="fin-modal-grid">
            <label className="fin-field">
              <span>{t("saudeClinicas.financeiro.lanc.valor")}</span>
              <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            </label>
            <label className="fin-field">
              <span>{t("saudeClinicas.financeiro.lanc.data")}</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </label>
            <label className="fin-field">
              <span>{tipo === "transferencia" ? t("saudeClinicas.financeiro.lanc.contaOrigem") : t("saudeClinicas.financeiro.lanc.conta")}</span>
              <select value={contaId} onChange={(e) => setContaId(e.target.value)}>
                <option value="">{t("saudeClinicas.financeiro.lanc.semConta")}</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            {tipo === "transferencia" && (
              <label className="fin-field">
                <span>{t("saudeClinicas.financeiro.lanc.contaDestino")}</span>
                <select value={contaDestinoId} onChange={(e) => setContaDestinoId(e.target.value)}>
                  <option value="">{t("saudeClinicas.financeiro.lanc.semConta")}</option>
                  {contas.filter((c) => c.id !== contaId).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </label>
            )}
            {tipo !== "transferencia" && (
              <>
                <label className="fin-field">
                  <span>{t("saudeClinicas.financeiro.config.aba.categorias")}</span>
                  <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                    <option value="">{t("saudeClinicas.financeiro.lanc.semCategoria")}</option>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>
                <label className="fin-field">
                  <span>{t("saudeClinicas.financeiro.config.aba.centros")}</span>
                  <select value={centroCustoId} onChange={(e) => setCentroCustoId(e.target.value)}>
                    <option value="">{t("saudeClinicas.financeiro.lanc.semCentro")}</option>
                    {centros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>
              </>
            )}
            {tipo === "receita" && (
              <>
                <label className="fin-field">
                  <span>{t("saudeClinicas.relatorios.coluna.convenio")}</span>
                  <select value={convenioId} onChange={(e) => setConvenioId(e.target.value)}>
                    <option value="">{t("saudeClinicas.financeiro.lanc.particular")}</option>
                    {convenios.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="fin-field">
                  <span>{t("saudeClinicas.servicos.convenios.servico")}</span>
                  <select value={procedureId} onChange={(e) => setProcedureId(e.target.value)}>
                    <option value="">{t("saudeClinicas.financeiro.lanc.semProcedimento")}</option>
                    {procedimentos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </>
            )}
          </div>

          {erro && <div className="sc-error">{erro}</div>}

          <div className="sc-modal-acoes">
            <button type="submit" className="btn-primary btn-small" disabled={salvando}>
              {salvando ? t("common.loading") : t("saudeClinicas.financeiro.lanc.salvar")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
