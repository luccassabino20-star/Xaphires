import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents } from "../financeiro/dinheiro.js";
import { hojeCivil, adicionarDias } from "./agendaUtils.js";
import DonutChart from "./DonutChart.jsx";
import BalancoChart from "./BalancoChart.jsx";
import LancamentoFinanceiroModal from "./LancamentoFinanceiroModal.jsx";

function primeiroDiaDoMes(civil) {
  return civil.slice(0, 7) + "-01";
}

const PRESETS = ["hoje", "7dias", "30dias", "mes"];

function rotuloMes(mesStr, lang) {
  const [ano, mes] = mesStr.split("-").map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString(lang, { month: "short", year: "2-digit" }).replace(".", "");
}

// Tela Resumo (Painel > Resumo, no menu Financeiro de Saúde & Clínicas):
// filtro de período + card de ações rápidas + saldo geral + os dois donuts
// (receita por convênio/procedimento) + balanço mensal. Tudo lido de
// scFinGetResumo (server: montarResumoFinanceiro) - fonte única desses
// números, pra esta tela nunca discordar de Receitas/Despesas/Extrato.
export default function FinanceiroResumoView() {
  const { t, i18n } = useTranslation();
  const [preset, setPreset] = useState("mes");
  const [periodo, setPeriodo] = useState(() => ({ from: primeiroDiaDoMes(hojeCivil()), to: hojeCivil() }));
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [modalTipo, setModalTipo] = useState(null); // 'receita' | 'despesa' | 'transferencia'

  async function carregar() {
    try {
      setDados(await api.scFinGetResumo(periodo.from, periodo.to));
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => { carregar(); }, [periodo]); // eslint-disable-line

  function aplicarPreset(p) {
    setPreset(p);
    const hoje = hojeCivil();
    if (p === "hoje") setPeriodo({ from: hoje, to: hoje });
    else if (p === "7dias") setPeriodo({ from: adicionarDias(hoje, -6), to: hoje });
    else if (p === "30dias") setPeriodo({ from: adicionarDias(hoje, -29), to: hoje });
    else if (p === "mes") setPeriodo({ from: primeiroDiaDoMes(hoje), to: hoje });
  }

  const balancoLinhas = dados
    ? dados.balancoMensal.map((m) => ({ mes: rotuloMes(m.mes, i18n.language), receitas: m.receitas, despesas: m.despesas }))
    : [];

  if (erro) return <div className="sc-error">{erro}</div>;

  return (
    <div className="sc-fin-resumo">
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

      {!dados ? (
        <div className="sc-empty">{t("common.loading")}</div>
      ) : (
        <>
          <div className="sc-fin-resumo-topo">
            <div className="sc-fin-card sc-fin-transacoes-card">
              <h4 className="sc-fin-donut-titulo">{t("saudeClinicas.financeiro.resumo.transacoes")}</h4>
              <div className="sc-fin-acoes-rapidas">
                <button type="button" className="sc-fin-acao-btn sc-fin-acao-receita" onClick={() => setModalTipo("receita")}>
                  + {t("saudeClinicas.financeiro.receita")}
                </button>
                <button type="button" className="sc-fin-acao-btn sc-fin-acao-despesa" onClick={() => setModalTipo("despesa")}>
                  + {t("saudeClinicas.financeiro.despesa")}
                </button>
                <button type="button" className="sc-fin-acao-btn sc-fin-acao-transferencia" onClick={() => setModalTipo("transferencia")}>
                  ⇄ {t("saudeClinicas.financeiro.transferencia")}
                </button>
              </div>
            </div>

            <div className="sc-fin-card sc-fin-saldo-card">
              <h4 className="sc-fin-donut-titulo">{t("saudeClinicas.financeiro.resumo.saldoGeral")}</h4>
              <strong className="sc-fin-saldo-valor">{formatCents(dados.saldoGeral, i18n.language)}</strong>
            </div>
          </div>

          <div className="sc-fin-resumo-donuts">
            <DonutChart titulo={t("saudeClinicas.financeiro.resumo.receitaConvenio")} dados={dados.receitasPorConvenio.map((r) => ({ nome: r.nome, total: r.total }))} lang={i18n.language} />
            <DonutChart titulo={t("saudeClinicas.financeiro.resumo.receitaProcedimento")} dados={dados.receitasPorProcedimento.map((r) => ({ nome: r.nome, total: r.total }))} lang={i18n.language} />
          </div>

          <div className="sc-fin-card">
            <h4 className="sc-fin-donut-titulo">{t("saudeClinicas.financeiro.resumo.balanco")}</h4>
            <BalancoChart linhas={balancoLinhas} meses={null} lang={i18n.language} />
          </div>
        </>
      )}

      {modalTipo && (
        <LancamentoFinanceiroModal tipo={modalTipo} onClose={() => setModalTipo(null)} onSaved={() => { setModalTipo(null); carregar(); }} />
      )}
    </div>
  );
}
