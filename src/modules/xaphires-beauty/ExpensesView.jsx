import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyEmptyState from "./BeautyEmptyState.jsx";

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ultimoDiaCivilDoMes(mesCivil) {
  const [y, m] = mesCivil.split("-").map(Number);
  return `${mesCivil}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}
function mesComDelta(mesCivil, delta) {
  const [y, m] = mesCivil.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function formatarMesAno(mesCivil, lang) {
  const [y, m] = mesCivil.split("-").map(Number);
  const rotulo = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}
function formatarMes(mesCivil, lang) {
  const [y, m] = mesCivil.split("-").map(Number);
  const rotulo = new Intl.DateTimeFormat(lang, { month: "long" }).format(new Date(y, m - 1, 1));
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}
function formatarValor(cents, locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}

// Mesma ordem das pílulas pedidas no desenho - precisa bater com
// CATEGORIAS_DESPESA em server/modules/xaphires-beauty/repo.js.
const CATEGORIAS = ["custos", "marketing", "comissoes", "pacotes", "reembolso_pacote", "adiantamento", "investimentos", "treinamentos", "outros"];

function formVazio(dueDate) {
  return { amount: "", description: "", category: "custos", recurring: false, dueDate, paid: false, notes: "" };
}

// Despesas (Fase 11): listagem por mês (navegador ‹ mês › no cabeçalho) +
// drawer lateral de lançamento. "Repetir" grava um modelo que gera uma
// ocorrência por mês sozinho (ver gerarOcorrenciasDoMes em repo.js) - a
// própria despesa que a pessoa está cadastrando já nasce visível no mês
// atual, então o drawer some ao fechar tratando o próximo mês como
// automático, não como algo que ela precisa lembrar de repetir.
export default function ExpensesView() {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const hoje = hojeCivil();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [despesas, setDespesas] = useState([]);
  const [totalMesAnterior, setTotalMesAnterior] = useState(0);
  const [erro, setErro] = useState("");
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [f, setF] = useState(() => formVazio(hoje));

  async function carregar() {
    const mesAnterior = mesComDelta(mes, -1);
    try {
      const [lista, listaAnterior] = await Promise.all([
        api.xbGetExpenses(`${mes}-01`, ultimoDiaCivilDoMes(mes)),
        api.xbGetExpenses(`${mesAnterior}-01`, ultimoDiaCivilDoMes(mesAnterior)),
      ]);
      setDespesas(lista);
      setTotalMesAnterior(listaAnterior.reduce((s, d) => s + d.amount_cents, 0));
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, [mes]);

  const status = useMemo(() => {
    const mesAtual = hoje.slice(0, 7);
    if (mes === mesAtual) {
      const [y, m] = mes.split("-").map(Number);
      return { tipo: "emCurso", dia: Number(hoje.slice(8, 10)), totalDias: new Date(y, m, 0).getDate() };
    }
    return { tipo: mes < mesAtual ? "encerrado" : "aComecar" };
  }, [mes, hoje]);

  function abrirDrawer() {
    setF(formVazio(mes === hoje.slice(0, 7) ? hoje : `${mes}-01`));
    setDrawerAberto(true);
  }
  function fecharDrawer() {
    setDrawerAberto(false);
  }

  async function salvar(e) {
    e.preventDefault();
    const amountCents = Math.round((Number(f.amount.replace(",", ".")) || 0) * 100);
    if (amountCents <= 0 || !f.description.trim() || !f.dueDate) return;
    try {
      await api.xbCreateExpense({
        amountCents,
        description: f.description.trim(),
        category: f.category,
        dueDate: f.dueDate,
        paid: f.paid,
        notes: f.notes,
        recurring: f.recurring,
      });
      showToast(t("modules.xaphiresBeauty.despesas.despesaLancada"));
      setF(formVazio(f.dueDate)); // painel continua aberto pra próxima nota, mesma data de agora
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }
  async function remover(despesa) {
    if (!window.confirm(t("modules.xaphiresBeauty.despesas.confirmarRemover", { descricao: despesa.description }))) return;
    try {
      await api.xbDeleteExpense(despesa.id);
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  const mesAnteriorNome = formatarMes(mesComDelta(mes, -1), i18n.language);
  const subtitulo =
    totalMesAnterior > 0
      ? t("modules.xaphiresBeauty.despesas.mesAnteriorComDespesa", { mes: mesAnteriorNome, valor: formatarValor(totalMesAnterior, i18n.language) })
      : t("modules.xaphiresBeauty.despesas.mesAnteriorSemDespesa", { mes: mesAnteriorNome });

  return (
    <div>
      <div className="beauty-page-head">
        <div>
          <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.despesas")}</h2>
          <p className="beauty-expenses-sub">{subtitulo}</p>
        </div>
        <div className="beauty-expenses-nav">
          <button type="button" className="btn-ghost" onClick={() => setMes(mesComDelta(mes, -1))}>‹</button>
          <span className="beauty-expenses-nav-label">
            {formatarMesAno(mes, i18n.language)} •{" "}
            {status.tipo === "emCurso"
              ? t("modules.xaphiresBeauty.despesas.periodoEmCurso", { dia: status.dia, totalDias: status.totalDias })
              : t(`modules.xaphiresBeauty.despesas.periodo${status.tipo === "encerrado" ? "Encerrado" : "AComecar"}`)}
          </span>
          <button type="button" className="btn-ghost" onClick={() => setMes(mesComDelta(mes, 1))}>›</button>
          {despesas.length > 0 && (
            <button type="button" className="btn-primary" onClick={abrirDrawer}>+ {t("modules.xaphiresBeauty.despesas.novaDespesa")}</button>
          )}
        </div>
      </div>

      {erro && <div className="beauty-error">{erro}</div>}

      <div className="beauty-card">
        {despesas.length === 0 ? (
          <>
            <BeautyEmptyState
              title={t("modules.xaphiresBeauty.despesas.vazioTitulo", { mes: formatarMes(mes, i18n.language) })}
              text={t("modules.xaphiresBeauty.despesas.vazioTexto")}
            />
            <div className="beauty-expenses-empty-actions">
              <button type="button" className="btn-primary" onClick={abrirDrawer}>+ {t("modules.xaphiresBeauty.despesas.lancarPrimeira")}</button>
              <button type="button" className="beauty-ov-card-link" onClick={() => setMes(mesComDelta(mes, -1))}>
                ‹ {t("modules.xaphiresBeauty.despesas.verMesAnterior", { mes: mesAnteriorNome })}
              </button>
            </div>
          </>
        ) : (
          <div className="beauty-list">
            <div className="beauty-list-head">
              <span style={{ width: 60 }}>{t("modules.xaphiresBeauty.despesas.colData")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.despesas.colDescricao")}</span>
              <span style={{ width: 150 }}>{t("modules.xaphiresBeauty.despesas.colCategoria")}</span>
              <span style={{ width: 90 }}>{t("modules.xaphiresBeauty.despesas.colSituacao")}</span>
              <span style={{ width: 100, textAlign: "right" }}>{t("modules.xaphiresBeauty.despesas.colValor")}</span>
            </div>
            {despesas.map((d) => (
              <div className="beauty-list-row" key={d.id}>
                <span className="beauty-cell-muted" style={{ width: 60 }}>{d.due_date.slice(8, 10)}/{d.due_date.slice(5, 7)}</span>
                <span className="beauty-cell-primary" style={{ flex: 1 }}>{d.description}</span>
                <span className="beauty-cell-muted" style={{ width: 150 }}>{t(`modules.xaphiresBeauty.despesas.categorias.${d.category}`)}</span>
                <span style={{ width: 90 }}>
                  <span className={"beauty-badge " + (d.paid ? "beauty-badge-concluido" : "beauty-badge-agendado")}>
                    {t(`modules.xaphiresBeauty.despesas.${d.paid ? "paga" : "pendente"}`)}
                  </span>
                </span>
                <span className="beauty-cell-primary" style={{ width: 100, textAlign: "right" }}>{formatarValor(d.amount_cents, i18n.language)}</span>
                <span className="beauty-col-actions">
                  <button type="button" className="btn-ghost" onClick={() => remover(d)}>{t("common.remove")}</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {drawerAberto && (
        <>
          <div className="beauty-drawer-overlay" onClick={fecharDrawer} />
          <div className="beauty-drawer" role="dialog" aria-modal="true">
            <div className="beauty-drawer-header">
              <div>
                <h3 className="beauty-drawer-title">{t("modules.xaphiresBeauty.despesas.novaDespesa")}</h3>
                <p className="beauty-drawer-sub">{t("modules.xaphiresBeauty.despesas.novaDespesaSub", { mes: formatarMesAno(mes, i18n.language) })}</p>
              </div>
              <button type="button" className="beauty-drawer-close" onClick={fecharDrawer} aria-label={t("common.close")}>
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>

            <form onSubmit={salvar} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              <div className="beauty-drawer-body">
                <div>
                  <p className="beauty-drawer-group-label">{t("modules.xaphiresBeauty.despesas.grupoDespesa")}</p>
                  <div className="beauty-drawer-row">
                    <div className="beauty-amount-wrap" style={{ flex: "0 0 33%" }}>
                      <span>R$</span>
                      <input inputMode="decimal" placeholder="0,00" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
                    </div>
                    <input
                      type="text"
                      style={{ flex: 1 }}
                      placeholder={t("modules.xaphiresBeauty.despesas.descricaoPlaceholder")}
                      value={f.description}
                      onChange={(e) => setF({ ...f, description: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <p className="beauty-drawer-group-label">{t("modules.xaphiresBeauty.despesas.grupoCategoria")}</p>
                  <div className="beauty-cat-pills">
                    {CATEGORIAS.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={"beauty-cat-pill" + (f.category === cat ? " active" : "")}
                        onClick={() => setF({ ...f, category: cat })}
                      >
                        {t(`modules.xaphiresBeauty.despesas.categorias.${cat}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="beauty-drawer-group-label">{t("modules.xaphiresBeauty.despesas.grupoRepetir")}</p>
                  <label className="beauty-switch">
                    <input type="checkbox" checked={f.recurring} onChange={(e) => setF({ ...f, recurring: e.target.checked })} />
                    <span className="beauty-switch-track" />
                    <span className="beauty-switch-label">{t("modules.xaphiresBeauty.despesas.repeteLabel")}</span>
                  </label>
                  {f.recurring && <p className="beauty-switch-dica">{t("modules.xaphiresBeauty.despesas.repeteDica")}</p>}
                </div>

                <div>
                  <p className="beauty-drawer-group-label">{t("modules.xaphiresBeauty.despesas.grupoQuando")}</p>
                  <div className="beauty-drawer-row" style={{ marginBottom: 10 }}>
                    <input type="date" style={{ flex: 1 }} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
                  </div>
                  <div className="beauty-view-toggle">
                    <button type="button" className={f.paid ? "active" : ""} onClick={() => setF({ ...f, paid: true })}>
                      {t("modules.xaphiresBeauty.despesas.jaPaguei")}
                    </button>
                    <button type="button" className={!f.paid ? "active" : ""} onClick={() => setF({ ...f, paid: false })}>
                      {t("modules.xaphiresBeauty.despesas.aindaNao")}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="beauty-drawer-group-label">{t("modules.xaphiresBeauty.despesas.grupoObservacao")}</p>
                  <textarea
                    rows={3}
                    style={{ width: "100%", resize: "vertical" }}
                    placeholder={t("modules.xaphiresBeauty.despesas.observacaoPlaceholder")}
                    value={f.notes}
                    onChange={(e) => setF({ ...f, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="beauty-drawer-footer">
                <p className="beauty-drawer-footer-note">{t("modules.xaphiresBeauty.despesas.painelContinuaAberto")}</p>
                <div className="beauty-drawer-footer-actions">
                  <button type="button" className="btn-ghost" onClick={fecharDrawer}>{t("common.cancel")}</button>
                  <button type="submit" className="btn-primary">{t("modules.xaphiresBeauty.despesas.lancarDespesa")}</button>
                </div>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
