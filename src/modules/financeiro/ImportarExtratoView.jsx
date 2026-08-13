import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents } from "./dinheiro.js";
import SearchSelect from "./SearchSelect.jsx";

// Importar extrato: sobe o PDF (Sicredi/Banestes), mostra o PREVIEW das
// transações parseadas e, ao confirmar, cria lançamentos finalizados na conta
// escolhida. O parser roda no servidor; aqui só o fluxo upload -> conferir ->
// importar/baixar Excel. Nada é gravado até o botão Importar.
export default function ImportarExtratoView() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();

  const [contas, setContas] = useState([]);
  const [contaId, setContaId] = useState("");
  const [preview, setPreview] = useState(null);
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.finListContas()
      .then((cs) => {
        const ativas = cs.filter((c) => c.ativo === 1);
        setContas(ativas);
        if (ativas[0]) setContaId(ativas[0].id);
      })
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contaOpts = useMemo(() => contas.map((c) => ({ id: c.id, label: c.nome })), [contas]);

  async function escolher(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErro(""); setPreview(null); setLendo(true);
    try {
      setPreview(await api.finExtratoPreview(file));
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setLendo(false);
    }
  }

  async function importar() {
    if (!contaId) return setErro(t("financeiro.importar.selecioneConta"));
    setImportando(true); setErro("");
    try {
      const r = await api.finImportarExtrato(contaId, preview.transacoes);
      showToast(t("financeiro.importar.resultado", { imp: r.importados, ign: r.ignorados }));
      setPreview(null);
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setImportando(false);
    }
  }

  async function baixarExcel() {
    setErro("");
    try {
      await api.finExtratoExcel(preview.transacoes);
    } catch (err) {
      setErro(translateError(err, t));
    }
  }

  return (
    <div className="fin-importar">
      <h3 className="fin-mov-titulo">{t("financeiro.importar.titulo")}</h3>
      <p className="fin-cad-hint">{t("financeiro.importar.ajuda")}</p>

      <div className="fin-toolbar">
        <label className="fin-field fin-importar-conta">
          <span>{t("financeiro.importar.conta")}</span>
          {contas.length === 0 ? (
            <span className="fin-cad-hint">{t("financeiro.importar.semContas")}</span>
          ) : (
            <SearchSelect value={contaId} onChange={setContaId} options={contaOpts} allLabel={t("financeiro.baixa.semConta")} />
          )}
        </label>
        <label className="btn-secondary btn-small fin-importar-file">
          {t("financeiro.importar.escolher")}
          <input type="file" accept="application/pdf,.pdf" onChange={escolher} hidden />
        </label>
      </div>

      {lendo && <div className="fin-loading">{t("financeiro.importar.lendo")}</div>}
      {erro && <div className="fin-error">{erro}</div>}

      {preview && (
        <>
          <div className="fin-importar-resumo">
            <span><strong>{t("financeiro.importar.banco")}:</strong> {preview.banco}</span>
            <span className="fin-receber">+ {formatCents(preview.resumo.creditos, lang)} {t("financeiro.importar.creditos")}</span>
            <span className="fin-pagar">- {formatCents(preview.resumo.debitos, lang)} {t("financeiro.importar.debitos")}</span>
            <span>{t("financeiro.total.titulos", { n: preview.resumo.count })}</span>
          </div>

          {preview.transacoes.length === 0 ? (
            <div className="fin-empty">{t("financeiro.importar.nenhuma")}</div>
          ) : (
            <>
              <div className="fin-importar-acoes">
                <button className="btn-primary btn-small" onClick={importar} disabled={importando || !contaId}>
                  {t("financeiro.importar.importar", { n: preview.transacoes.length })}
                </button>
                <button className="btn-ghost btn-small" onClick={baixarExcel}>{t("financeiro.importar.baixarExcel")}</button>
              </div>

              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>{t("financeiro.importar.data")}</th>
                      <th>{t("financeiro.col.status")}</th>
                      <th className="fin-num">{t("financeiro.col.valor")}</th>
                      <th>{t("financeiro.importar.historico")}</th>
                      <th className="fin-num">{t("financeiro.importar.saldo")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.transacoes.map((tx, i) => (
                      <tr key={i}>
                        <td>{tx.dataMovimento}</td>
                        <td className={tx.tipo === "C" ? "fin-receber" : "fin-pagar"}>{tx.tipo}</td>
                        <td className={"fin-num " + (tx.tipo === "C" ? "fin-receber" : "fin-pagar")}>
                          {tx.tipo === "C" ? "+" : "-"} {formatCents(tx.valorCents, lang)}
                        </td>
                        <td>{tx.historico}</td>
                        <td className="fin-num">{tx.saldoCents == null ? "-" : formatCents(Math.abs(tx.saldoCents), lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
