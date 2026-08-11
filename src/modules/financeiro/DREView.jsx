import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents } from "./dinheiro.js";

// DRE gerencial em regime de caixa (só o que foi pago entra). Período padrão: o
// ano corrente inteiro. A fonte dos números é o servidor (calculos.montarDRE);
// aqui só se desenha.
export default function DREView() {
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

  const semCategoria = t("financeiro.dre.semCategoria");
  const resultadoPositivo = dre.resultado >= 0;

  return (
    <div className="fin-dre">
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

      <div className="fin-dre-grid">
        <section className="fin-dre-bloco">
          <h3 className="fin-dre-titulo fin-receber">{t("financeiro.dre.receitas")}</h3>
          <ul className="fin-dre-lista">
            {dre.receitas.length === 0 ? (
              <li className="fin-empty">{t("financeiro.vazio")}</li>
            ) : (
              dre.receitas.map((r) => (
                <li key={r.id || "sem"}>
                  <span>{r.nome || semCategoria}</span>
                  <span className="fin-num">{formatCents(r.total, lang)}</span>
                </li>
              ))
            )}
          </ul>
          <div className="fin-dre-subtotal">
            <span>{t("financeiro.dre.totalReceitas")}</span>
            <span className="fin-num fin-receber">{formatCents(dre.totalReceitas, lang)}</span>
          </div>
        </section>

        <section className="fin-dre-bloco">
          <h3 className="fin-dre-titulo fin-pagar">{t("financeiro.dre.despesas")}</h3>
          <ul className="fin-dre-lista">
            {dre.despesas.length === 0 ? (
              <li className="fin-empty">{t("financeiro.vazio")}</li>
            ) : (
              dre.despesas.map((d) => (
                <li key={d.id || "sem"}>
                  <span>{d.nome || semCategoria}</span>
                  <span className="fin-num">{formatCents(d.total, lang)}</span>
                </li>
              ))
            )}
          </ul>
          <div className="fin-dre-subtotal">
            <span>{t("financeiro.dre.totalDespesas")}</span>
            <span className="fin-num fin-pagar">{formatCents(dre.totalDespesas, lang)}</span>
          </div>
        </section>
      </div>

      <div className={"fin-dre-resultado " + (resultadoPositivo ? "positivo" : "negativo")}>
        <span>{t("financeiro.dre.resultado")}</span>
        <span className="fin-num">{formatCents(dre.resultado, lang)}</span>
      </div>
    </div>
  );
}
