import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents, reaisParaCents } from "./dinheiro.js";

// Estado inicial do formulário de novo lançamento.
function formVazio() {
  return { tipo: "receber", descricao: "", valor: "", due: new Date().toISOString().slice(0, 10), categoryId: "", contraparte: "" };
}

export default function LancamentosView() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();

  const [categorias, setCategorias] = useState([]);
  const [lancamentos, setLancamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [form, setForm] = useState(formVazio());
  const [enviando, setEnviando] = useState(false);
  const [formErro, setFormErro] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const [cats, lancs] = await Promise.all([api.finListCategorias(lang), api.finListLancamentos()]);
      setCategorias(cats);
      setLancamentos(lancs);
      setErro("");
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catById = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias]);

  // KPIs a partir do conjunto completo (não do filtrado), para o número não mudar
  // quando a pessoa filtra a tabela.
  const kpis = useMemo(() => {
    let aReceber = 0, aPagar = 0;
    for (const l of lancamentos) {
      if (l.status !== "pendente") continue;
      if (l.tipo === "receber") aReceber += l.valor_cents;
      else aPagar += l.valor_cents;
    }
    return { aReceber, aPagar };
  }, [lancamentos]);

  const visiveis = useMemo(
    () =>
      lancamentos.filter(
        (l) => (!filtroTipo || l.tipo === filtroTipo) && (!filtroStatus || l.status === filtroStatus)
      ),
    [lancamentos, filtroTipo, filtroStatus]
  );

  async function submitNovo(e) {
    e.preventDefault();
    setFormErro("");
    const valorCents = reaisParaCents(form.valor);
    if (!valorCents) return setFormErro(t("financeiro.form.valorInvalido"));
    if (!form.due) return setFormErro(t("financeiro.form.dataObrigatoria"));
    setEnviando(true);
    try {
      await api.finCreateLancamento({
        tipo: form.tipo,
        descricao: form.descricao.trim(),
        valorCents,
        due: form.due,
        categoryId: form.categoryId || undefined,
        contraparte: form.contraparte.trim(),
      });
      setForm(formVazio());
      showToast(t("financeiro.toast.criado"));
      await carregar();
    } catch (err) {
      setFormErro(translateError(err, t));
    } finally {
      setEnviando(false);
    }
  }

  async function baixar(l) {
    try {
      await api.finBaixarLancamento(l.id);
      await carregar();
    } catch (err) {
      alert(translateError(err, t));
    }
  }
  async function estornar(l) {
    try {
      await api.finEstornarLancamento(l.id);
      await carregar();
    } catch (err) {
      alert(translateError(err, t));
    }
  }
  async function excluir(l) {
    if (!confirm(t("financeiro.confirm.excluir"))) return;
    try {
      await api.finDeleteLancamento(l.id);
      showToast(t("financeiro.toast.excluido"));
      await carregar();
    } catch (err) {
      alert(translateError(err, t));
    }
  }

  if (carregando) return <div className="fin-loading">{t("common.loading")}</div>;
  if (erro) return <div className="fin-error">{erro}</div>;

  return (
    <div className="fin-lancamentos">
      <div className="fin-kpis">
        <div className="fin-kpi fin-kpi-receber">
          <span className="fin-kpi-label">{t("financeiro.kpi.aReceber")}</span>
          <span className="fin-kpi-value">{formatCents(kpis.aReceber, lang)}</span>
        </div>
        <div className="fin-kpi fin-kpi-pagar">
          <span className="fin-kpi-label">{t("financeiro.kpi.aPagar")}</span>
          <span className="fin-kpi-value">{formatCents(kpis.aPagar, lang)}</span>
        </div>
        <div className="fin-kpi">
          <span className="fin-kpi-label">{t("financeiro.kpi.saldoPrevisto")}</span>
          <span className="fin-kpi-value">{formatCents(kpis.aReceber - kpis.aPagar, lang)}</span>
        </div>
      </div>

      <form className="fin-form" onSubmit={submitNovo}>
        <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
          <option value="receber">{t("financeiro.tipo.receber")}</option>
          <option value="pagar">{t("financeiro.tipo.pagar")}</option>
        </select>
        <input
          type="text"
          placeholder={t("financeiro.form.descricao")}
          value={form.descricao}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
        />
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder={t("financeiro.form.valor")}
          value={form.valor}
          onChange={(e) => setForm({ ...form, valor: e.target.value })}
        />
        <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
        <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
          <option value="">{t("financeiro.form.semCategoria")}</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder={t("financeiro.form.contraparte")}
          value={form.contraparte}
          onChange={(e) => setForm({ ...form, contraparte: e.target.value })}
        />
        <button type="submit" className="btn-primary btn-small" disabled={enviando}>
          {t("financeiro.form.adicionar")}
        </button>
      </form>
      {formErro && <div className="fin-error">{formErro}</div>}

      <div className="fin-filtros">
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="">{t("financeiro.filtro.todosTipos")}</option>
          <option value="receber">{t("financeiro.tipo.receber")}</option>
          <option value="pagar">{t("financeiro.tipo.pagar")}</option>
        </select>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="">{t("financeiro.filtro.todosStatus")}</option>
          <option value="pendente">{t("financeiro.status.pendente")}</option>
          <option value="pago">{t("financeiro.status.pago")}</option>
        </select>
      </div>

      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>{t("financeiro.col.descricao")}</th>
              <th>{t("financeiro.col.categoria")}</th>
              <th>{t("financeiro.col.contraparte")}</th>
              <th>{t("financeiro.col.vencimento")}</th>
              <th className="fin-num">{t("financeiro.col.valor")}</th>
              <th>{t("financeiro.col.status")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr>
                <td colSpan={7} className="fin-empty">{t("financeiro.vazio")}</td>
              </tr>
            ) : (
              visiveis.map((l) => (
                <tr key={l.id} className={l.status === "pago" ? "fin-row-pago" : ""}>
                  <td>{l.descricao || "-"}</td>
                  <td>{catById[l.category_id]?.nome || "-"}</td>
                  <td>{l.contraparte || "-"}</td>
                  <td>{l.due}</td>
                  <td className={"fin-num " + (l.tipo === "receber" ? "fin-receber" : "fin-pagar")}>
                    {l.tipo === "receber" ? "+" : "-"} {formatCents(l.valor_cents, lang)}
                  </td>
                  <td>
                    <span className={"fin-badge fin-badge-" + l.status}>{t("financeiro.status." + l.status)}</span>
                  </td>
                  <td className="fin-row-actions">
                    {l.status === "pendente" ? (
                      <button className="btn-ghost btn-small" onClick={() => baixar(l)}>{t("financeiro.acao.baixar")}</button>
                    ) : (
                      <button className="btn-ghost btn-small" onClick={() => estornar(l)}>{t("financeiro.acao.estornar")}</button>
                    )}
                    <button className="btn-danger btn-small" onClick={() => excluir(l)}>{t("financeiro.acao.excluir")}</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
