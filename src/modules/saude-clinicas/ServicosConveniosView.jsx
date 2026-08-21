import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import ConvenioPrecosModal from "./ConvenioPrecosModal.jsx";

// Cadastro de convênios + tabela de preços por procedimento (ConvenioPrecosModal).
// Fica dentro de Serviços & Procedimentos porque é dado clínico (quem a
// clínica atende e quanto cobra por convênio), não financeiro - nenhuma
// baixa, conta ou fluxo de caixa entra aqui.
export default function ServicosConveniosView() {
  const { t } = useTranslation();
  const showToast = useToast();
  const [planos, setPlanos] = useState(null);
  const [erro, setErro] = useState("");
  const [nomeNovo, setNomeNovo] = useState("");
  const [planoAberto, setPlanoAberto] = useState(null);

  async function carregar() {
    try {
      setPlanos(await api.scListInsurancePlans());
    } catch (e) {
      setErro(translateError(e, t));
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  async function criar(e) {
    e.preventDefault();
    if (!nomeNovo.trim()) return showToast(t("saudeClinicas.servicos.convenios.nomeObrigatorio"));
    try {
      await api.scCreateInsurancePlan({ name: nomeNovo.trim() });
      showToast(t("saudeClinicas.servicos.convenios.criado"));
      setNomeNovo("");
      carregar();
    } catch (e2) {
      showToast(translateError(e2, t));
    }
  }

  async function alternarAtivo(plano) {
    try {
      await api.scUpdateInsurancePlan(plano.id, { active: plano.active ? 0 : 1 });
      carregar();
    } catch (e) {
      showToast(translateError(e, t));
    }
  }

  if (erro) return <div className="sc-error">{erro}</div>;

  return (
    <div className="sc-servicos-convenios">
      <h3 className="sc-config-title">{t("saudeClinicas.servicos.convenios.titulo")}</h3>

      <form className="sc-servicos-form" onSubmit={criar}>
        <input
          type="text" placeholder={t("saudeClinicas.servicos.convenios.nomePlaceholder")}
          value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)}
        />
        <button type="submit" className="btn-primary btn-small">{t("saudeClinicas.servicos.convenios.adicionar")}</button>
      </form>

      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("saudeClinicas.servicos.convenios.nome")}</th>
              <th>{t("saudeClinicas.servicos.convenios.status")}</th>
              <th>{t("saudeClinicas.servicos.catalogo.acoes")}</th>
            </tr>
          </thead>
          <tbody>
            {!planos || planos.length === 0 ? (
              <tr><td colSpan={3} className="sc-empty">{t("saudeClinicas.servicos.convenios.semConvenios")}</td></tr>
            ) : (
              planos.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    <span className={"sc-servicos-status" + (p.active ? " ativo" : " inativo")}>
                      {t(p.active ? "saudeClinicas.servicos.convenios.ativo" : "saudeClinicas.servicos.convenios.inativo")}
                    </span>
                  </td>
                  <td className="sc-servicos-acoes">
                    <button type="button" className="btn-ghost btn-small" onClick={() => setPlanoAberto(p)}>
                      {t("saudeClinicas.servicos.convenios.verPrecos")}
                    </button>
                    <button type="button" className="btn-ghost btn-small" onClick={() => alternarAtivo(p)}>
                      {t(p.active ? "saudeClinicas.servicos.catalogo.desativar" : "saudeClinicas.servicos.catalogo.ativar")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {planoAberto && <ConvenioPrecosModal plano={planoAberto} onClose={() => setPlanoAberto(null)} />}
    </div>
  );
}
