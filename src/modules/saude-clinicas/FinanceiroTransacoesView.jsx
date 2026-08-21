import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents } from "../financeiro/dinheiro.js";
import LancamentoFinanceiroModal from "./LancamentoFinanceiroModal.jsx";

// Receitas/Despesas: lista de lançamentos do tipo (já realizados, sem baixa -
// ver o comentário em LancamentoFinanceiroModal.jsx), com botão de lançar um
// novo.
export default function FinanceiroTransacoesView({ tipo }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [modalAberto, setModalAberto] = useState(false);

  async function carregar() {
    try {
      setLista(await api.scFinListLancamentos({ tipo }));
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => { carregar(); }, [tipo]); // eslint-disable-line

  async function excluir(id) {
    try {
      await api.scFinDeleteLancamento(id);
      showToast(t("saudeClinicas.financeiro.lanc.excluido"));
      carregar();
    } catch (e) {
      showToast(translateError(e, t));
    }
  }

  const cor = tipo === "receita" ? "sc-fin-receita" : "sc-fin-despesa";
  const total = lista ? lista.reduce((s, l) => s + l.valor_cents, 0) : 0;

  if (erro) return <div className="sc-error">{erro}</div>;

  return (
    <div className="sc-fin-transacoes">
      <div className="sc-fin-transacoes-topo">
        <h3 className="sc-config-title">{t(`saudeClinicas.sidebar.${tipo === "receita" ? "receitasFin" : "despesasFin"}`)}</h3>
        <button type="button" className={"btn-primary btn-small " + cor} onClick={() => setModalAberto(true)}>
          + {t(`saudeClinicas.financeiro.${tipo}`)}
        </button>
      </div>

      <div className={"sc-fin-transacoes-total " + cor}>
        <span>{t("saudeClinicas.financeiro.total")}</span>
        <span>{formatCents(total, i18n.language)}</span>
      </div>

      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("saudeClinicas.relatorios.coluna.data")}</th>
              <th>{t("saudeClinicas.financeiro.lanc.descricao")}</th>
              <th>{t("saudeClinicas.financeiro.config.aba.categorias")}</th>
              <th>{t("saudeClinicas.financeiro.lanc.conta")}</th>
              <th>{t("saudeClinicas.financeiro.total")}</th>
              <th>{t("saudeClinicas.servicos.catalogo.acoes")}</th>
            </tr>
          </thead>
          <tbody>
            {!lista || lista.length === 0 ? (
              <tr><td colSpan={6} className="sc-empty">{t("saudeClinicas.financeiro.semLancamentos")}</td></tr>
            ) : lista.map((l) => (
              <tr key={l.id}>
                <td>{l.data}</td>
                <td>{l.descricao || "-"}</td>
                <td>{l.categoria_nome || "-"}</td>
                <td>{l.conta_nome || "-"}</td>
                <td className={cor}>{formatCents(l.valor_cents, i18n.language)}</td>
                <td><button type="button" className="btn-ghost btn-small" onClick={() => excluir(l.id)}>{t("common.delete")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <LancamentoFinanceiroModal tipo={tipo} onClose={() => setModalAberto(false)} onSaved={() => { setModalAberto(false); carregar(); }} />
      )}
    </div>
  );
}
