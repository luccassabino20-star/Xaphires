import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents, liquidoDoLancamento } from "./dinheiro.js";
import SearchSelect from "./SearchSelect.jsx";

// Movimentação = o EXTRATO de uma conta: escolhe a conta bancária e vê o que já
// foi quitado nela (finalizado), com o saldo e a opção de estornar. Quitar título
// (a baixa) mudou para a aba Títulos, onde se seleciona vários e dá quitado - aqui
// é só olhar o dinheiro que se moveu na conta e, se preciso, desfazer.
export default function MovimentacaoView() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);

  const [lancamentos, setLancamentos] = useState([]);
  const [contatos, setContatos] = useState([]);
  const [contas, setContas] = useState([]);
  const [saldos, setSaldos] = useState({ contas: [] });
  const [contaId, setContaId] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const [lancs, cts, cos, sal] = await Promise.all([
        api.finListLancamentos(), api.finListContatos(), api.finListContas(), api.finGetSaldos(),
      ]);
      setLancamentos(lancs); setContatos(cts); setContas(cos); setSaldos(sal);
      setErro("");
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  const contatoById = useMemo(() => Object.fromEntries(contatos.map((c) => [c.id, c])), [contatos]);
  const contasAtivas = useMemo(() => contas.filter((c) => c.ativo === 1), [contas]);
  const contaOpts = useMemo(() => contasAtivas.map((c) => ({ id: c.id, label: c.nome })), [contasAtivas]);
  useEffect(() => { if (!contaId && contasAtivas.length) setContaId(contasAtivas[0].id); }, [contasAtivas, contaId]);

  const nomeContraparte = (l) => contatoById[l.contato_id]?.nome || l.contraparte || "-";

  // O que se moveu nesta conta: os títulos finalizados apontando para ela, do mais
  // recente para o mais antigo (pela data da baixa).
  const movimentos = useMemo(
    () => lancamentos.filter((l) => l.status === "finalizado" && l.conta_id === contaId).sort((a, b) => (b.paid_at || "").localeCompare(a.paid_at || "")),
    [lancamentos, contaId]
  );
  const saldoConta = saldos.contas.find((c) => c.id === contaId)?.saldo ?? null;

  async function estornar(l) {
    setErro("");
    try { await api.finEstornarLancamento(l.id); await carregar(); } catch (e) { setErro(translateError(e, t)); }
  }

  if (carregando) return <div className="fin-loading">{t("common.loading")}</div>;
  if (erro) return <div className="fin-error">{erro}</div>;

  return (
    <div className="fin-movimentacao">
      <div className="fin-mov-topo">
        <label className="fin-field fin-mov-conta">
          <span>{t("financeiro.contas.nome")}</span>
          {contasAtivas.length === 0 ? (
            <span className="fin-cad-hint">{t("financeiro.importar.semContas")}</span>
          ) : (
            <SearchSelect value={contaId} onChange={setContaId} options={contaOpts} allLabel={t("financeiro.baixa.semConta")} />
          )}
        </label>
        {contaId && saldoConta != null && (
          <div className="fin-mov-saldo">
            <span>{t("financeiro.contas.saldo")}</span>
            <strong className={saldoConta < 0 ? "fin-pagar" : "fin-receber"}>{formatCents(saldoConta, lang)}</strong>
          </div>
        )}
      </div>

      {contaId && (
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>{t("financeiro.col.titulo")}</th>
                <th>{t("financeiro.tit.dataBaixa")}</th>
                <th>{t("financeiro.col.contraparte")}</th>
                <th>{t("financeiro.col.descricao")}</th>
                <th className="fin-num">{t("financeiro.col.valor")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {movimentos.length === 0 ? (
                <tr><td colSpan={6} className="fin-empty">{t("financeiro.mov.extratoVazio")}</td></tr>
              ) : (
                movimentos.map((l) => (
                  <tr key={l.id}>
                    <td>{l.numero}</td>
                    <td>{l.paid_at}</td>
                    <td>{nomeContraparte(l)}</td>
                    <td>{l.descricao || "-"}</td>
                    <td className={"fin-num " + (l.tipo === "receber" ? "fin-receber" : "fin-pagar")}>
                      {l.tipo === "receber" ? "+" : "-"} {formatCents(liquidoDoLancamento(l), lang)}
                    </td>
                    <td className="fin-row-actions">
                      <button className="btn-ghost btn-small" onClick={() => estornar(l)}>{t("financeiro.acao.estornar")}</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
