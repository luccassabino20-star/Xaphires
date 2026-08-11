import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents } from "./dinheiro.js";

// Saldos por conta corrente: saldo inicial + movimento realizado. Números vêm do
// servidor (calculos.montarSaldos) - o saldo é derivado, nunca gravado.
export default function ContasView() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.finGetSaldos().then((d) => { setDados(d); setErro(""); }).catch((e) => setErro(translateError(e, t)));
  }, [t]);

  if (erro) return <div className="fin-error">{erro}</div>;
  if (!dados) return <div className="fin-loading">{t("common.loading")}</div>;

  return (
    <div className="fin-contas">
      <div className="fin-kpis">
        <div className="fin-kpi">
          <span className="fin-kpi-label">{t("financeiro.contas.saldoTotal")}</span>
          <span className="fin-kpi-value">{formatCents(dados.saldoTotal, lang)}</span>
        </div>
      </div>
      {dados.contas.length === 0 ? (
        <p className="fin-empty">{t("financeiro.contas.vazio")}</p>
      ) : (
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>{t("financeiro.contas.nome")}</th>
                <th>{t("financeiro.contas.banco")}</th>
                <th className="fin-num">{t("financeiro.contas.saldoInicial")}</th>
                <th className="fin-num">{t("financeiro.contas.movimento")}</th>
                <th className="fin-num">{t("financeiro.contas.saldo")}</th>
              </tr>
            </thead>
            <tbody>
              {dados.contas.map((c) => (
                <tr key={c.id} className={c.ativo ? "" : "fin-row-pago"}>
                  <td>{c.nome}</td>
                  <td>{c.banco || "-"}</td>
                  <td className="fin-num">{formatCents(c.saldoInicial, lang)}</td>
                  <td className={"fin-num " + (c.movimento >= 0 ? "fin-receber" : "fin-pagar")}>{formatCents(c.movimento, lang)}</td>
                  <td className="fin-num">{formatCents(c.saldo, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
