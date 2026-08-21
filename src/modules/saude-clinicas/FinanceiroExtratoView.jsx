import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents } from "../financeiro/dinheiro.js";
import { hojeCivil } from "./agendaUtils.js";

function primeiroDiaDoMes(civil) {
  return civil.slice(0, 7) + "-01";
}

// Extrato de uma conta: saldo inicial + cada lançamento que passou por ela
// (entrada/saída/transferência), com saldo corrente linha a linha.
export default function FinanceiroExtratoView() {
  const { t, i18n } = useTranslation();
  const [contas, setContas] = useState([]);
  const [contaId, setContaId] = useState("");
  const [de, setDe] = useState(primeiroDiaDoMes(hojeCivil()));
  const [ate, setAte] = useState(hojeCivil());
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.scFinListContas().then((cs) => {
      setContas(cs);
      if (cs[0]) setContaId(cs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!contaId) return;
    api
      .scFinListLancamentos({ contaId, de, ate })
      .then((l) => { setLista(l); setErro(""); })
      .catch((e) => setErro(translateError(e, t)));
  }, [contaId, de, ate, t]);

  const conta = contas.find((c) => c.id === contaId);

  const linhasComSaldo = useMemo(() => {
    if (!lista || !conta) return [];
    // Mais antigo primeiro pra acumular o saldo em ordem - lista já vem
    // DESC do servidor (pensada pra tabela recente-primeiro), então inverte.
    const cronologico = [...lista].reverse();
    let saldo = conta.saldo_inicial_cents;
    const linhas = [];
    for (const l of cronologico) {
      const entrada = l.tipo === "receita" || (l.tipo === "transferencia" && l.conta_destino_id === contaId);
      const valorAssinado = entrada ? l.valor_cents : -l.valor_cents;
      saldo += valorAssinado;
      linhas.push({ ...l, valorAssinado, saldoCorrente: saldo });
    }
    return linhas.reverse();
  }, [lista, conta, contaId]);

  if (erro) return <div className="sc-error">{erro}</div>;

  return (
    <div className="sc-fin-extrato">
      <h3 className="sc-config-title">{t("saudeClinicas.sidebar.extratoFin")}</h3>

      <div className="sc-rel-filtros">
        <select className="sc-agenda-filtro" value={contaId} onChange={(e) => setContaId(e.target.value)}>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <span className="sc-hint">–</span>
        <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
      </div>

      {conta && (
        <div className="sc-fin-transacoes-total">
          <span>{t("saudeClinicas.financeiro.resumo.saldoGeral")}</span>
          <span>{formatCents(linhasComSaldo[0]?.saldoCorrente ?? conta.saldo_inicial_cents, i18n.language)}</span>
        </div>
      )}

      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("saudeClinicas.relatorios.coluna.data")}</th>
              <th>{t("saudeClinicas.financeiro.lanc.descricao")}</th>
              <th>{t("saudeClinicas.financeiro.tipo")}</th>
              <th>{t("saudeClinicas.financeiro.total")}</th>
              <th>{t("saudeClinicas.financeiro.resumo.saldo")}</th>
            </tr>
          </thead>
          <tbody>
            {!contas.length ? (
              <tr><td colSpan={5} className="sc-empty">{t("saudeClinicas.financeiro.config.semContasCadastradas")}</td></tr>
            ) : linhasComSaldo.length === 0 ? (
              <tr><td colSpan={5} className="sc-empty">{t("saudeClinicas.financeiro.semLancamentos")}</td></tr>
            ) : linhasComSaldo.map((l) => (
              <tr key={l.id}>
                <td>{l.data}</td>
                <td>{l.descricao || (l.tipo === "transferencia" ? t("saudeClinicas.financeiro.transferencia") : "-")}</td>
                <td>{t(`saudeClinicas.financeiro.${l.tipo}`)}</td>
                <td className={l.valorAssinado >= 0 ? "sc-fin-receita" : "sc-fin-despesa"}>{formatCents(l.valorAssinado, i18n.language)}</td>
                <td>{formatCents(l.saldoCorrente, i18n.language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
