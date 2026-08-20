import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../state/AuthContext.jsx";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents } from "../financeiro/dinheiro.js";
import { hojeCivil, adicionarDias } from "./agendaUtils.js";

function primeiroDiaDoMes(dataCivil) {
  return dataCivil.slice(0, 7) + "-01";
}

// Estrutura da tela inspirada no menu "Relatórios" de sistemas de gestão de
// clínica de mercado (iClinic e afins) - três grupos, cada um com seus
// relatórios. `disabled` é quem não tem dado real por trás ainda: "Análise
// de despesas" e "Fluxo de caixa" já existem, só que no módulo Financeiro
// (outra fonte de verdade - duplicar aqui divergiria cedo ou tarde), e
// nenhum dos dois é dado de agendamento.
const GRUPOS = [
  {
    id: "atendimentos",
    itens: ["atendimentos-realizados", "pacientes-retorno", "pacientes-periodo", "pacientes-cid", "pacientes-indicacao", "faltas-paciente"],
  },
  {
    id: "financas",
    itens: ["analise-despesas", "analise-receitas", "repasse-profissionais", "fluxo-caixa"],
  },
  {
    id: "relacionamentos",
    itens: ["aniversariantes", "satisfacao-paciente"],
  },
];
const DESABILITADOS = new Set(["analise-despesas", "fluxo-caixa"]);
const COLUNAS_MOEDA = new Set(["receitaCents", "repasseCents"]);
const COLUNAS_PERCENTUAL = new Set(["comissaoPct", "percentual"]);
const USA_AGRUPADO_POR = new Set(["analise-receitas"]);
const USA_MES = new Set(["aniversariantes"]);

export default function ReportsView() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const showToast = useToast();
  const isMaster = user?.role === "master";

  const [tipo, setTipo] = useState("atendimentos-realizados");
  const [preset, setPreset] = useState("mes");
  const [periodo, setPeriodo] = useState(() => ({ from: primeiroDiaDoMes(hojeCivil()), to: hojeCivil() }));
  const [mes, setMes] = useState(() => Number(hojeCivil().slice(5, 7)));
  const [groupBy, setGroupBy] = useState("categoria");
  const [professionals, setProfessionals] = useState([]);
  const [professionalId, setProfessionalId] = useState("");
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [comissoesEditando, setComissoesEditando] = useState({});

  useEffect(() => {
    api.listUsers().then(setProfessionals).catch(() => {});
  }, []);

  function aplicarPreset(p) {
    setPreset(p);
    const hoje = hojeCivil();
    if (p === "hoje") setPeriodo({ from: hoje, to: hoje });
    else if (p === "7dias") setPeriodo({ from: adicionarDias(hoje, -6), to: hoje });
    else if (p === "30dias") setPeriodo({ from: adicionarDias(hoje, -29), to: hoje });
    else if (p === "mes") setPeriodo({ from: primeiroDiaDoMes(hoje), to: hoje });
  }

  async function gerar(paginaAlvo = 1) {
    setCarregando(true);
    setErro("");
    try {
      const from = USA_MES.has(tipo) ? `${hojeCivil().slice(0, 4)}-${String(mes).padStart(2, "0")}-01` : periodo.from;
      const to = USA_MES.has(tipo) ? from : periodo.to;
      const resultado = await api.scGetReport(tipo, { from, to, professionalId: professionalId || null, groupBy, page: paginaAlvo, pageSize: 25 });
      setDados(resultado);
      setPagina(paginaAlvo);
    } catch (e) {
      setErro(translateError(e, t));
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }

  // Trocar de relatório limpa o resultado anterior - senão a tabela de
  // "Faltas por paciente" ficaria na tela por um instante com as colunas de
  // "Repasse por profissionais", que não combinam.
  useEffect(() => {
    setDados(null);
    setErro("");
    // eslint-disable-next-line
  }, [tipo]);

  async function baixar(formato) {
    try {
      const from = USA_MES.has(tipo) ? `${hojeCivil().slice(0, 4)}-${String(mes).padStart(2, "0")}-01` : periodo.from;
      const to = USA_MES.has(tipo) ? from : periodo.to;
      await api.scBaixarRelatorio(tipo, formato, { from, to, professionalId: professionalId || null, groupBy }, i18n.language);
    } catch (e) {
      showToast(translateError(e, t));
    }
  }

  async function salvarComissao(userId) {
    const valor = Number(comissoesEditando[userId]);
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) return;
    try {
      await api.scSetComissao(userId, valor);
      showToast(t("saudeClinicas.relatorios.comissaoSalva"));
      await gerar(pagina);
    } catch (e) {
      showToast(translateError(e, t));
    }
    setComissoesEditando((cur) => { const novo = { ...cur }; delete novo[userId]; return novo; });
  }

  function formatarCelula(coluna, valor, linha) {
    if (coluna === "comissaoPct" && tipo === "repasse-profissionais" && isMaster) {
      const editando = comissoesEditando[linha.userId];
      return (
        <span className="sc-rel-comissao">
          <input
            type="number" min={0} max={100} step={1} className="sc-rel-comissao-input"
            value={editando !== undefined ? editando : valor}
            onChange={(e) => setComissoesEditando((cur) => ({ ...cur, [linha.userId]: e.target.value }))}
          />
          %
          {editando !== undefined && editando !== String(valor) && (
            <button type="button" className="btn-ghost btn-small" onClick={() => salvarComissao(linha.userId)}>{t("common.save")}</button>
          )}
        </span>
      );
    }
    if (valor === null || valor === undefined) return "-";
    if (COLUNAS_MOEDA.has(coluna)) return formatCents(valor, i18n.language);
    if (COLUNAS_PERCENTUAL.has(coluna)) return `${valor}%`;
    return String(valor);
  }

  const itemAtivoDesabilitado = DESABILITADOS.has(tipo);
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.pageSize)) : 1;

  return (
    <div className="sc-relatorios">
      <nav className="sc-rel-nav">
        {GRUPOS.map((grupo) => (
          <div key={grupo.id} className="sc-rel-nav-grupo">
            <h4 className="sc-rel-nav-titulo">{t(`saudeClinicas.relatorios.grupo.${grupo.id}`)}</h4>
            {grupo.itens.map((item) => (
              <button
                key={item}
                type="button"
                className={"sc-rel-nav-item" + (tipo === item ? " active" : "") + (DESABILITADOS.has(item) ? " disabled" : "")}
                onClick={() => setTipo(item)}
              >
                {t(`saudeClinicas.relatorios.tipo.${item}`)}
                {DESABILITADOS.has(item) && <span className="sc-sidebar-item-badge">{t("modules.comingSoon")}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sc-rel-conteudo">
        <h3 className="sc-config-title">{t(`saudeClinicas.relatorios.tipo.${tipo}`)}</h3>

        {itemAtivoDesabilitado ? (
          <div className="sc-placeholder-pane">{t("saudeClinicas.relatorios.disponivelFinanceiro")}</div>
        ) : (
          <>
            <div className="sc-rel-filtros">
              {USA_MES.has(tipo) ? (
                <select className="sc-agenda-filtro" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{t(`saudeClinicas.agenda.mes.${m - 1}`)}</option>
                  ))}
                </select>
              ) : (
                <>
                  <div className="sc-toggle-group">
                    {["hoje", "7dias", "30dias", "mes"].map((p) => (
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
                </>
              )}

              {USA_AGRUPADO_POR.has(tipo) && (
                <select className="sc-agenda-filtro" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                  <option value="categoria">{t("saudeClinicas.relatorios.agrupadoPor.categoria")}</option>
                  <option value="profissional">{t("saudeClinicas.relatorios.agrupadoPor.profissional")}</option>
                  <option value="convenio">{t("saudeClinicas.relatorios.agrupadoPor.convenio")}</option>
                </select>
              )}

              <select className="sc-agenda-filtro" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
                <option value="">{t("saudeClinicas.agenda.filtroProfissionalTodos")}</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <button type="button" className="btn-primary btn-small" onClick={() => gerar(1)} disabled={carregando}>
                {carregando ? t("common.loading") : t("saudeClinicas.relatorios.gerar")}
              </button>
            </div>

            {erro && <div className="sc-error">{erro}</div>}

            {dados && (
              <>
                {tipo === "satisfacao-paciente" && dados.media !== null && dados.media !== undefined && (
                  <p className="sc-dash-duracao">
                    <span className="sc-dash-duracao-valor">{dados.media}</span>
                    <span className="sc-dash-duracao-unidade">/ 5 · {t("saudeClinicas.relatorios.mediaGeral")}</span>
                  </p>
                )}

                <div className="sc-table-wrap">
                  <table className="sc-table">
                    <thead>
                      <tr>
                        {dados.colunas.map((c) => (
                          <th key={c}>{t(`saudeClinicas.relatorios.coluna.${c}`)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dados.linhas.length === 0 ? (
                        <tr><td colSpan={dados.colunas.length} className="sc-empty">{t("saudeClinicas.relatorios.semRegistro")}</td></tr>
                      ) : (
                        dados.linhas.map((linha, i) => (
                          <tr key={i}>
                            {dados.colunas.map((c) => (
                              <td key={c}>{formatarCelula(c, linha[c], linha)}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {dados.total > dados.pageSize && (
                  <div className="sc-rel-paginacao">
                    <button type="button" className="btn-ghost btn-small" onClick={() => gerar(pagina - 1)} disabled={pagina <= 1 || carregando}>‹</button>
                    <span className="sc-hint">{t("saudeClinicas.relatorios.paginaDe", { pagina, total: totalPaginas })}</span>
                    <button type="button" className="btn-ghost btn-small" onClick={() => gerar(pagina + 1)} disabled={pagina >= totalPaginas || carregando}>›</button>
                  </div>
                )}

                <div className="sc-rel-exportar">
                  <button type="button" className="btn-secondary btn-small" onClick={() => baixar("csv")}>{t("saudeClinicas.relatorios.exportarCsv")}</button>
                  <button type="button" className="btn-secondary btn-small" onClick={() => baixar("pdf")}>{t("saudeClinicas.relatorios.exportarPdf")}</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
