import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents, reaisParaCents } from "../financeiro/dinheiro.js";

// Tabela de preços de UM convênio: uma linha por procedimento ativo do
// catálogo, com o preço particular ao lado (referência) e um campo editável
// para o preço negociado do convênio. Sem preço definido, mostra "Não
// definido" em vez de cair de volta no preço particular - ver o comentário
// de listPlanPrices no repo.js.
export default function ConvenioPrecosModal({ plano, onClose }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [linhas, setLinhas] = useState(null);
  const [erro, setErro] = useState("");
  const [rascunhos, setRascunhos] = useState({});

  async function carregar() {
    try {
      setLinhas(await api.scListPlanPrices(plano.id));
    } catch (e) {
      setErro(translateError(e, t));
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, [plano.id]);

  async function salvarPreco(procedureId) {
    const valor = reaisParaCents(rascunhos[procedureId]);
    if (valor === null) return;
    try {
      await api.scSetPlanPrice(plano.id, procedureId, valor);
      showToast(t("saudeClinicas.servicos.convenios.precoSalvo"));
      setRascunhos((r) => { const novo = { ...r }; delete novo[procedureId]; return novo; });
      carregar();
    } catch (e) {
      showToast(translateError(e, t));
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sc-convenio-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
        <h3 className="sc-config-title">{t("saudeClinicas.servicos.convenios.tabelaPrecos", { nome: plano.name })}</h3>

        {erro && <div className="sc-error">{erro}</div>}

        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th>{t("saudeClinicas.servicos.convenios.servico")}</th>
                <th>{t("saudeClinicas.servicos.convenios.precoParticular")}</th>
                <th>{t("saudeClinicas.servicos.convenios.precoConvenio")}</th>
              </tr>
            </thead>
            <tbody>
              {!linhas || linhas.length === 0 ? (
                <tr><td colSpan={3} className="sc-empty">{t("saudeClinicas.servicos.catalogo.semServicos")}</td></tr>
              ) : (
                linhas.map((l) => {
                  const editando = rascunhos[l.procedure_id];
                  const valorAtual = editando !== undefined ? editando : (l.plan_price_cents != null ? String(l.plan_price_cents / 100).replace(".", ",") : "");
                  return (
                    <tr key={l.procedure_id}>
                      <td>{l.procedure_name}</td>
                      <td>{formatCents(l.base_price_cents, i18n.language)}</td>
                      <td>
                        <span className="sc-rel-comissao">
                          <input
                            type="text" inputMode="decimal" className="sc-rel-comissao-input"
                            placeholder={t("saudeClinicas.servicos.convenios.naoDefinido")}
                            value={valorAtual}
                            onChange={(e) => setRascunhos((r) => ({ ...r, [l.procedure_id]: e.target.value }))}
                          />
                          {editando !== undefined && (
                            <button type="button" className="btn-ghost btn-small" onClick={() => salvarPreco(l.procedure_id)}>
                              {t("saudeClinicas.servicos.catalogo.salvar")}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
