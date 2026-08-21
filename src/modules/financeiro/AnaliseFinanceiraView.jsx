import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents } from "./dinheiro.js";

// Análise de despesas / Análise de receitas (Relatórios, no menu Finanças):
// mesmo DRE gerencial que a aba DRE já usa (calculos.montarDRE, regime de
// caixa) - fonte única dos números, sem segunda conta que pudesse divergir -
// só que aqui é UM lado só (`tipo`), como ranking por categoria com barra de
// proporção, em vez das duas colunas lado a lado da DRE.
export default function AnaliseFinanceiraView({ tipo }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const ano = new Date().getFullYear();

  const [de, setDe] = useState(`${ano}-01-01`);
  const [ate, setAte] = useState(`${ano}-12-31`);
  const [dre, setDre] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api
      .finGetDRE(de, ate)
      .then((d) => { setDre(d); setErro(""); })
      .catch((err) => setErro(translateError(err, t)));
  }, [de, ate, t]);

  if (erro) return <div className="fin-error">{erro}</div>;
  if (!dre) return <div className="fin-loading">{t("common.loading")}</div>;

  const linhas = (tipo === "receitas" ? dre.receitas : dre.despesas).slice().sort((a, b) => b.total - a.total);
  const total = tipo === "receitas" ? dre.totalReceitas : dre.totalDespesas;
  const max = Math.max(1, ...linhas.map((l) => l.total));
  const cor = tipo === "receitas" ? "fin-receber" : "fin-pagar";
  const semCategoria = t("financeiro.dre.semCategoria");

  return (
    <div className="fin-analise">
      <div className="fin-periodo">
        <label>
          {t("financeiro.periodo.de")}
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label>
          {t("financeiro.periodo.ate")}
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
      </div>

      <div className={"fin-analise-total " + cor}>
        <span>{t(tipo === "receitas" ? "financeiro.dre.totalReceitas" : "financeiro.dre.totalDespesas")}</span>
        <span className="fin-num">{formatCents(total, lang)}</span>
      </div>

      {linhas.length === 0 ? (
        <div className="fin-empty">{t("financeiro.vazio")}</div>
      ) : (
        <ul className="fin-analise-lista">
          {linhas.map((l) => {
            const pct = total > 0 ? Math.round((l.total / total) * 100) : 0;
            const largura = Math.max(2, (l.total / max) * 100);
            return (
              <li key={l.id || "sem"} className="fin-analise-item">
                <div className="fin-analise-item-topo">
                  <span className="fin-analise-item-nome">{l.nome || semCategoria}</span>
                  <span className="fin-analise-item-valores">
                    <span className="fin-num">{formatCents(l.total, lang)}</span>
                    <span className="fin-analise-item-pct">{pct}%</span>
                  </span>
                </div>
                <div className="fin-analise-bar">
                  <div className={"fin-analise-bar-fill " + cor} style={{ width: `${largura}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
