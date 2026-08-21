import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents } from "../financeiro/dinheiro.js";
import BalancoChart from "./BalancoChart.jsx";

function nomesMeses(lang) {
  const fmt = new Intl.DateTimeFormat(lang, { month: "short" });
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2020, i, 1)).replace(".", ""));
}

// Fluxo de caixa: visão do ano inteiro (receita x despesa por mês), a partir
// dos mesmos lançamentos de Receitas/Despesas/Extrato - sem tabela de
// totais mensais à parte pra não divergir da lista.
export default function FinanceiroFluxoCaixaView() {
  const { t, i18n } = useTranslation();
  const meses = useMemo(() => nomesMeses(i18n.language), [i18n.language]);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api
      .scFinListLancamentos({ de: `${ano}-01-01`, ate: `${ano}-12-31` })
      .then((l) => { setLista(l); setErro(""); })
      .catch((e) => setErro(translateError(e, t)));
  }, [ano, t]);

  const linhas = useMemo(() => {
    const porMes = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, receitas: 0, despesas: 0 }));
    if (!lista) return porMes;
    for (const l of lista) {
      if (l.tipo !== "receita" && l.tipo !== "despesa") continue;
      const mesIdx = Number(l.data.slice(5, 7)) - 1;
      if (l.tipo === "receita") porMes[mesIdx].receitas += l.valor_cents;
      else porMes[mesIdx].despesas += l.valor_cents;
    }
    let acumulado = 0;
    return porMes.map((m) => {
      acumulado += m.receitas - m.despesas;
      return { ...m, saldo: m.receitas - m.despesas, acumulado };
    });
  }, [lista]);

  const totais = useMemo(
    () => linhas.reduce((acc, l) => ({ receitas: acc.receitas + l.receitas, despesas: acc.despesas + l.despesas }), { receitas: 0, despesas: 0 }),
    [linhas]
  );

  if (erro) return <div className="sc-error">{erro}</div>;

  return (
    <div className="sc-fin-fluxo">
      <h3 className="sc-config-title">{t("saudeClinicas.sidebar.fluxoCaixaFin")}</h3>

      <div className="sc-dash-header">
        <div className="sc-year">
          <button type="button" className="btn-ghost btn-small" onClick={() => setAno((a) => a - 1)}>‹</button>
          <span className="sc-year-value">{ano}</span>
          <button type="button" className="btn-ghost btn-small" onClick={() => setAno((a) => a + 1)}>›</button>
        </div>
      </div>

      <div className="sc-fin-kpis">
        <div className="sc-fin-kpi sc-fin-receita"><span>{t("saudeClinicas.financeiro.receita")}</span><strong>{formatCents(totais.receitas, i18n.language)}</strong></div>
        <div className="sc-fin-kpi sc-fin-despesa"><span>{t("saudeClinicas.financeiro.despesa")}</span><strong>{formatCents(totais.despesas, i18n.language)}</strong></div>
        <div className="sc-fin-kpi"><span>{t("saudeClinicas.financeiro.resumo.saldo")}</span><strong>{formatCents(totais.receitas - totais.despesas, i18n.language)}</strong></div>
      </div>

      {!lista ? <div className="sc-empty">{t("common.loading")}</div> : <BalancoChart linhas={linhas} meses={meses} lang={i18n.language} />}

      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("saudeClinicas.financeiro.fluxo.mes")}</th>
              <th>{t("saudeClinicas.financeiro.receita")}</th>
              <th>{t("saudeClinicas.financeiro.despesa")}</th>
              <th>{t("saudeClinicas.financeiro.resumo.saldo")}</th>
              <th>{t("saudeClinicas.financeiro.fluxo.acumulado")}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes}>
                <td>{meses[l.mes - 1]}</td>
                <td className="sc-fin-receita">{formatCents(l.receitas, i18n.language)}</td>
                <td className="sc-fin-despesa">{formatCents(l.despesas, i18n.language)}</td>
                <td>{formatCents(l.saldo, i18n.language)}</td>
                <td>{formatCents(l.acumulado, i18n.language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
