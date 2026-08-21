import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents } from "../financeiro/dinheiro.js";
import { hojeCivil, adicionarDias } from "./agendaUtils.js";

function primeiroDiaDoMes(dataCivil) {
  return dataCivil.slice(0, 7) + "-01";
}

const PRESETS = ["hoje", "7dias", "30dias", "mes"];

// Receita por procedimento, dentro do escopo estrito de Saúde & Clínicas:
// reaproveita o relatório "Análise de receitas" (groupBy=categoria) já
// existente em reports.js - mesma fonte única de "análise de receitas" em
// Relatórios, só que numa tela dedicada dentro de Serviços & Procedimentos.
// Não inclui despesa nem fluxo de caixa (isso é competência exclusiva do
// módulo Financeiro, produto separado - ver CLAUDE.md).
export default function ServicosDesempenhoView() {
  const { t, i18n } = useTranslation();
  const [preset, setPreset] = useState("mes");
  const [periodo, setPeriodo] = useState(() => ({ from: primeiroDiaDoMes(hojeCivil()), to: hojeCivil() }));
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    setCarregando(true);
    api
      .scGetReport("analise-receitas", { from: periodo.from, to: periodo.to, groupBy: "categoria", page: 1, pageSize: 100000 })
      .then((d) => { setDados(d); setErro(""); })
      .catch((e) => setErro(translateError(e, t)))
      .finally(() => setCarregando(false));
  }, [periodo, t]);

  function aplicarPreset(p) {
    setPreset(p);
    const hoje = hojeCivil();
    if (p === "hoje") setPeriodo({ from: hoje, to: hoje });
    else if (p === "7dias") setPeriodo({ from: adicionarDias(hoje, -6), to: hoje });
    else if (p === "30dias") setPeriodo({ from: adicionarDias(hoje, -29), to: hoje });
    else if (p === "mes") setPeriodo({ from: primeiroDiaDoMes(hoje), to: hoje });
  }

  return (
    <div className="sc-servicos-desempenho">
      <h3 className="sc-config-title">{t("saudeClinicas.servicos.desempenho.titulo")}</h3>
      <p className="sc-hint">{t("saudeClinicas.servicos.desempenho.hint")}</p>

      <div className="sc-dash-header">
        <div className="sc-toggle-group">
          {PRESETS.map((p) => (
            <button key={p} type="button" className={"sc-toggle-btn" + (preset === p ? " active" : "")} onClick={() => aplicarPreset(p)}>
              {t(`saudeClinicas.dashboard.preset.${p}`)}
            </button>
          ))}
        </div>
        <div className="sc-dash-header-datas">
          <input type="date" value={periodo.from} onChange={(e) => { setPreset(null); setPeriodo((p) => ({ ...p, from: e.target.value })); }} />
          <span className="sc-hint">–</span>
          <input type="date" value={periodo.to} onChange={(e) => { setPreset(null); setPeriodo((p) => ({ ...p, to: e.target.value })); }} />
        </div>
      </div>

      {erro && <div className="sc-error">{erro}</div>}

      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("saudeClinicas.relatorios.coluna.grupo")}</th>
              <th>{t("saudeClinicas.relatorios.coluna.numAtendimentos")}</th>
              <th>{t("saudeClinicas.relatorios.coluna.receitaCents")}</th>
            </tr>
          </thead>
          <tbody>
            {!dados || carregando ? (
              <tr><td colSpan={3} className="sc-empty">{t("common.loading")}</td></tr>
            ) : dados.linhas.length === 0 ? (
              <tr><td colSpan={3} className="sc-empty">{t("saudeClinicas.relatorios.semRegistro")}</td></tr>
            ) : (
              dados.linhas.map((linha, i) => (
                <tr key={i}>
                  <td>{linha.grupo}</td>
                  <td>{linha.numAtendimentos}</td>
                  <td>{formatCents(linha.receitaCents, i18n.language)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
