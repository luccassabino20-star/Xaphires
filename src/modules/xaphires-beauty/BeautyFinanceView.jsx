import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyEmptyState from "./BeautyEmptyState.jsx";
import BeautyIcon from "./BeautyIcon.jsx";
import BeautyDonutChart from "./BeautyDonutChart.jsx";
import BeautyBalancoChart from "./BeautyBalancoChart.jsx";

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function limitesDoMes(mes) {
  const [ano, m] = mes.split("-").map(Number);
  const de = `${mes}-01T00:00:00`;
  const proximo = m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, "0")}`;
  return { from: de, to: `${proximo}-01T00:00:00` };
}
function formatarValor(cents, locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}
function nomesMeses(lang) {
  const fmt = new Intl.DateTimeFormat(lang, { month: "short" });
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2020, i, 1)).replace(".", ""));
}

const FORM_VAZIO = { appointmentId: "", amount: "", method: "dinheiro" };
const OVERRIDE_VAZIO = { staffId: "", serviceId: "", pct: "" };

// Financeiro do módulo (Premium+): ledger manual de pagamento, dashboard
// (donut por método + balanço mensal entrada/saída) e comissão por
// profissional - com override opcional por serviço (Fase 7). Não é
// cobrança real - ver o comentário em schema.js sobre beauty_payments.
export default function BeautyFinanceView({ canUse }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [mes, setMes] = useState(mesAtual());
  const [ano, setAno] = useState(new Date().getFullYear());
  const meses = useMemo(() => nomesMeses(i18n.language), [i18n.language]);
  const [pagamentos, setPagamentos] = useState([]);
  const [comissoes, setComissoes] = useState([]);
  const [concluidos, setConcluidos] = useState([]);
  const [porMetodo, setPorMetodo] = useState([]);
  const [balancoMensal, setBalancoMensal] = useState(null);
  const [equipe, setEquipe] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(FORM_VAZIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [fOverride, setFOverride] = useState(OVERRIDE_VAZIO);

  async function carregar() {
    if (!canUse) return;
    const { from, to } = limitesDoMes(mes);
    try {
      const [pag, com, ag, met, eq, sv, ov] = await Promise.all([
        api.xbGetPayments(from, to),
        api.xbGetCommissions(from, to),
        api.xbGetAppointments(from, to),
        api.xbGetRevenueByMethod(from, to),
        api.xbGetStaff(),
        api.xbGetServices(),
        api.xbGetCommissionOverrides(),
      ]);
      setPagamentos(pag);
      setComissoes(com);
      setConcluidos(ag.filter((a) => a.status === "concluido"));
      setPorMetodo(met);
      setEquipe(eq);
      setServicos(sv);
      setOverrides(ov);
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, [mes, canUse]);

  useEffect(() => {
    if (!canUse) return;
    setBalancoMensal(null);
    api
      .xbGetMonthlySummary(ano)
      .then(setBalancoMensal)
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, [ano, canUse]);

  function escolherAtendimento(id) {
    const atendimento = concluidos.find((a) => a.id === id);
    setF({ appointmentId: id, amount: atendimento ? String(atendimento.price_cents / 100) : "", method: "dinheiro" });
  }

  async function salvar(e) {
    e.preventDefault();
    if (!f.appointmentId) return;
    const amountCents = Math.max(1, Math.round((Number(f.amount.replace(",", ".")) || 0) * 100));
    try {
      await api.xbCreatePayment({ appointmentId: f.appointmentId, method: f.method, amountCents });
      showToast(t("modules.xaphiresBeauty.financeiro.salvo"));
      setF(FORM_VAZIO);
      setMostrarForm(false);
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function salvarOverride(e) {
    e.preventDefault();
    if (!fOverride.staffId || !fOverride.serviceId) return;
    const commissionRate = Math.min(1, Math.max(0, (Number(fOverride.pct) || 0) / 100));
    try {
      const atualizado = await api.xbSetCommissionOverride(fOverride.staffId, fOverride.serviceId, commissionRate);
      setOverrides(atualizado);
      setFOverride(OVERRIDE_VAZIO);
      showToast(t("modules.xaphiresBeauty.financeiro.comissaoSalva"));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function removerOverride(o) {
    if (!window.confirm(t("modules.xaphiresBeauty.financeiro.confirmarRemoverComissao", { profissional: o.staff_name, servico: o.service_name }))) return;
    try {
      await api.xbDeleteCommissionOverride(o.staff_id, o.service_id);
      showToast(t("modules.xaphiresBeauty.financeiro.comissaoRemovida"));
      setOverrides((ov) => ov.filter((x) => !(x.staff_id === o.staff_id && x.service_id === o.service_id)));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  if (!canUse) {
    return (
      <div>
        <div className="beauty-page-head">
          <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.financeiro")}</h2>
        </div>
        <div className="beauty-card">
          <div className="beauty-lock-card">
            <BeautyIcon name="financeiro" size={30} />
            <span>{t("modules.xaphiresBeauty.financeiro.bloqueado", { plano: t("plan.names.intermediate") })}</span>
          </div>
        </div>
      </div>
    );
  }

  const dadosDonut = porMetodo.map((m) => ({ nome: t(`modules.xaphiresBeauty.financeiro.metodos.${m.method}`), total: m.total }));

  return (
    <div>
      <div className="beauty-page-head">
        <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.financeiro")}</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input className="beauty-month-input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          <button type="button" className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? t("common.cancel") : t("modules.xaphiresBeauty.financeiro.novoPagamento")}
          </button>
        </div>
      </div>

      {mostrarForm && (
        <div className="beauty-card" style={{ marginBottom: 18 }}>
          <form className="beauty-form" onSubmit={salvar}>
            <select value={f.appointmentId} onChange={(e) => escolherAtendimento(e.target.value)} style={{ flex: 1, minWidth: 240 }}>
              <option value="">{t("modules.xaphiresBeauty.financeiro.escolherAtendimento")}</option>
              {concluidos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.starts_at.slice(0, 10)} {a.starts_at.slice(11, 16)} - {a.client_name} ({a.service_name})
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              placeholder={t("modules.xaphiresBeauty.financeiro.valor")}
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
              style={{ maxWidth: 130 }}
            />
            <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              <option value="dinheiro">{t("modules.xaphiresBeauty.financeiro.metodos.dinheiro")}</option>
              <option value="pix">{t("modules.xaphiresBeauty.financeiro.metodos.pix")}</option>
              <option value="cartao">{t("modules.xaphiresBeauty.financeiro.metodos.cartao")}</option>
            </select>
            <button type="submit" className="btn-primary">{t("common.save")}</button>
          </form>
        </div>
      )}

      {erro && <div className="beauty-error">{erro}</div>}

      <div className="beauty-fin-dashboard">
        <div className="beauty-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 className="beauty-section-title" style={{ margin: 0 }}>{t("modules.xaphiresBeauty.financeiro.balancoMensal")}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" className="btn-ghost" onClick={() => setAno((a) => a - 1)}>‹</button>
              <span className="beauty-cell-primary">{ano}</span>
              <button type="button" className="btn-ghost" onClick={() => setAno((a) => a + 1)}>›</button>
            </div>
          </div>
          {!balancoMensal ? (
            <p className="beauty-cell-muted">{t("common.loading")}</p>
          ) : (
            <BeautyBalancoChart linhas={balancoMensal} meses={meses} lang={i18n.language} />
          )}
        </div>
        <BeautyDonutChart titulo={t("modules.xaphiresBeauty.financeiro.faturamentoPorMetodo")} dados={dadosDonut} lang={i18n.language} />
      </div>

      <h3 className="beauty-section-title">{t("modules.xaphiresBeauty.financeiro.pagamentos")}</h3>
      <div className="beauty-card" style={{ marginBottom: 8 }}>
        {pagamentos.length === 0 ? (
          <BeautyEmptyState title={t("modules.xaphiresBeauty.financeiro.vazio")} />
        ) : (
          <div className="beauty-list">
            <div className="beauty-list-head">
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.financeiro.data")}</span>
              <span style={{ flex: 1.4 }}>{t("modules.xaphiresBeauty.clientes.nome")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.financeiro.metodo")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.financeiro.valor")}</span>
            </div>
            {pagamentos.map((p) => (
              <div className="beauty-list-row" key={p.id}>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{p.paid_at.slice(0, 10)}</span>
                <span className="beauty-cell-primary" style={{ flex: 1.4 }}>{p.client_name}</span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{t(`modules.xaphiresBeauty.financeiro.metodos.${p.method}`)}</span>
                <span style={{ flex: 1 }}>{formatarValor(p.amount_cents, i18n.language)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 className="beauty-section-title">{t("modules.xaphiresBeauty.financeiro.comissoes")}</h3>
      <div className="beauty-card" style={{ marginBottom: 18 }}>
        {comissoes.length === 0 ? (
          <BeautyEmptyState title={t("modules.xaphiresBeauty.financeiro.vazio")} />
        ) : (
          <div className="beauty-list">
            <div className="beauty-list-head">
              <span style={{ flex: 1.4 }}>{t("modules.xaphiresBeauty.equipe.nome")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.financeiro.totalAtendido")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.financeiro.comissao")}</span>
            </div>
            {comissoes.map((c) => (
              <div className="beauty-list-row" key={c.staffId}>
                <span className="beauty-cell-primary" style={{ flex: 1.4 }}>{c.name}</span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{formatarValor(c.totalCents, i18n.language)}</span>
                <span style={{ flex: 1 }}>{formatarValor(c.commissionCents, i18n.language)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 className="beauty-section-title">{t("modules.xaphiresBeauty.financeiro.comissaoPorServico")}</h3>
      <div className="beauty-card" style={{ marginBottom: 18 }}>
        <form className="beauty-form" onSubmit={salvarOverride}>
          <select value={fOverride.staffId} onChange={(e) => setFOverride({ ...fOverride, staffId: e.target.value })} style={{ flex: 1, minWidth: 160 }}>
            <option value="">{t("modules.xaphiresBeauty.financeiro.escolherProfissional")}</option>
            {equipe.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select value={fOverride.serviceId} onChange={(e) => setFOverride({ ...fOverride, serviceId: e.target.value })} style={{ flex: 1, minWidth: 160 }}>
            <option value="">{t("modules.xaphiresBeauty.financeiro.escolherServico")}</option>
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            max="100"
            placeholder={t("modules.xaphiresBeauty.equipe.comissao")}
            value={fOverride.pct}
            onChange={(e) => setFOverride({ ...fOverride, pct: e.target.value })}
            style={{ maxWidth: 130 }}
          />
          <button type="submit" className="btn-primary">{t("common.save")}</button>
        </form>
      </div>
      <div className="beauty-card">
        {overrides.length === 0 ? (
          <BeautyEmptyState title={t("modules.xaphiresBeauty.financeiro.semOverrides")} />
        ) : (
          <div className="beauty-list">
            <div className="beauty-list-head">
              <span style={{ flex: 1.2 }}>{t("modules.xaphiresBeauty.financeiro.profissional")}</span>
              <span style={{ flex: 1.2 }}>{t("modules.xaphiresBeauty.financeiro.servico")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.equipe.comissao")}</span>
            </div>
            {overrides.map((o) => (
              <div className="beauty-list-row" key={`${o.staff_id}:${o.service_id}`}>
                <span className="beauty-cell-primary" style={{ flex: 1.2 }}>{o.staff_name}</span>
                <span className="beauty-cell-muted" style={{ flex: 1.2 }}>{o.service_name}</span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{Math.round(o.commission_rate * 100)}%</span>
                <span className="beauty-col-actions">
                  <button type="button" className="btn-ghost" onClick={() => removerOverride(o)}>{t("common.remove")}</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
