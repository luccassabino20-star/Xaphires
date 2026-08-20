import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents } from "./dinheiro.js";

// Drill-down de uma célula da matriz: só leitura (data, descrição, contraparte,
// conta, valor líquido) - editar lançamento é função das abas Lançamentos/Títulos,
// isto aqui é relatório. Mesma classificação por grupo do servidor
// (calculos.classificarPorGrupo), então a soma das linhas fecha com a célula que a
// pessoa clicou.
export default function FluxoCaixaLancamentosModal({ grupo, grupoLabel, colunaLabel, de, ate, contaId, onClose }) {
  const { t, i18n } = useTranslation();
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api
      .finFluxoCaixaLancamentos({ grupo, de, ate, contaId })
      .then((r) => { setItens(r); setErro(""); })
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, [grupo, de, ate, contaId]);

  const total = itens ? itens.reduce((s, l) => s + l.valorCents, 0) : 0;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal fin-matriz-lanc-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
        <h3 className="fin-matriz-modal-titulo">{grupoLabel}</h3>
        <p className="fin-matriz-hint">{colunaLabel}</p>

        {erro && <div className="fin-error">{erro}</div>}

        {!itens ? (
          <p className="fin-matriz-hint">{t("common.loading")}</p>
        ) : itens.length === 0 ? (
          <p className="fin-empty">{t("financeiro.fluxoCaixa.lancamentos.semLancamentos")}</p>
        ) : (
          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>{t("financeiro.fluxoCaixa.coluna.data")}</th>
                  <th>{t("financeiro.fluxoCaixa.coluna.descricao")}</th>
                  <th>{t("financeiro.fluxoCaixa.coluna.contraparte")}</th>
                  <th>{t("financeiro.fluxoCaixa.coluna.conta")}</th>
                  <th className="fin-num">{t("financeiro.fluxoCaixa.coluna.valor")}</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((l) => (
                  <tr key={l.id}>
                    <td>{l.data}</td>
                    <td>{l.descricao || "-"}</td>
                    <td>{l.contraparte || "-"}</td>
                    <td>{l.contaNome || "-"}</td>
                    <td className="fin-num">{formatCents(l.valorCents, i18n.language)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}><strong>{t("financeiro.fluxoCaixa.totalColuna")}</strong></td>
                  <td className="fin-num"><strong>{formatCents(total, i18n.language)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
