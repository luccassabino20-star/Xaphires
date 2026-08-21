import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents } from "../financeiro/dinheiro.js";
import { hojeCivil } from "./agendaUtils.js";

function primeiroDiaDoMes(civil) {
  return civil.slice(0, 7) + "-01";
}

// Análise de despesas/receitas: ranking por categoria com barra de
// proporção, a partir dos mesmos lançamentos que Receitas/Despesas listam
// (sem endpoint de agregação à parte - poucos lançamentos por clínica, soma
// em memória é instantânea e não corre risco de divergir da lista).
export default function FinanceiroAnaliseView({ tipo }) {
  const { t, i18n } = useTranslation();
  const [de, setDe] = useState(primeiroDiaDoMes(hojeCivil()));
  const [ate, setAte] = useState(hojeCivil());
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api
      .scFinListLancamentos({ tipo, de, ate })
      .then((l) => { setLista(l); setErro(""); })
      .catch((e) => setErro(translateError(e, t)));
  }, [tipo, de, ate, t]);

  const { linhas, total } = useMemo(() => {
    if (!lista) return { linhas: [], total: 0 };
    const mapa = new Map();
    let soma = 0;
    for (const l of lista) {
      const chave = l.categoria_nome || t("saudeClinicas.financeiro.semCategoria");
      mapa.set(chave, (mapa.get(chave) || 0) + l.valor_cents);
      soma += l.valor_cents;
    }
    return { linhas: [...mapa.entries()].map(([nome, v]) => ({ nome, total: v })).sort((a, b) => b.total - a.total), total: soma };
  }, [lista, t]);

  const cor = tipo === "receita" ? "sc-fin-receita" : "sc-fin-despesa";
  const max = Math.max(1, ...linhas.map((l) => l.total));

  if (erro) return <div className="sc-error">{erro}</div>;

  return (
    <div className="sc-fin-analise">
      <h3 className="sc-config-title">{t(`saudeClinicas.sidebar.${tipo === "receita" ? "analiseReceitasFin" : "analiseDespesasFin"}`)}</h3>

      <div className="sc-rel-filtros">
        <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <span className="sc-hint">–</span>
        <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
      </div>

      <div className={"sc-fin-transacoes-total " + cor}>
        <span>{t("saudeClinicas.financeiro.total")}</span>
        <span>{formatCents(total, i18n.language)}</span>
      </div>

      {!lista ? (
        <div className="sc-empty">{t("common.loading")}</div>
      ) : linhas.length === 0 ? (
        <div className="sc-empty">{t("saudeClinicas.financeiro.semLancamentos")}</div>
      ) : (
        <ul className="sc-fin-analise-lista">
          {linhas.map((l) => {
            const pct = total > 0 ? Math.round((l.total / total) * 100) : 0;
            const largura = Math.max(2, (l.total / max) * 100);
            return (
              <li key={l.nome} className="sc-fin-analise-item">
                <div className="sc-fin-analise-item-topo">
                  <span>{l.nome}</span>
                  <span><strong>{formatCents(l.total, i18n.language)}</strong> <em>{pct}%</em></span>
                </div>
                <div className="sc-fin-analise-bar"><div className={"sc-fin-analise-bar-fill " + cor} style={{ width: `${largura}%` }} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
