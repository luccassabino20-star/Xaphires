import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyEmptyState from "./BeautyEmptyState.jsx";
import BeautyIcon from "./BeautyIcon.jsx";

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

const FORM_VAZIO = { appointmentId: "", amount: "", method: "dinheiro" };

// Financeiro do módulo (Premium+): ledger manual de pagamento e o resumo de
// comissão por profissional, os dois no mesmo período (mês). Não é cobrança
// real - ver o comentário em schema.js sobre beauty_payments.
export default function BeautyFinanceView({ canUse }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [mes, setMes] = useState(mesAtual());
  const [pagamentos, setPagamentos] = useState([]);
  const [comissoes, setComissoes] = useState([]);
  const [concluidos, setConcluidos] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(FORM_VAZIO);
  const [mostrarForm, setMostrarForm] = useState(false);

  async function carregar() {
    if (!canUse) return;
    const { from, to } = limitesDoMes(mes);
    try {
      const [pag, com, ag] = await Promise.all([
        api.xbGetPayments(from, to),
        api.xbGetCommissions(from, to),
        api.xbGetAppointments(from, to),
      ]);
      setPagamentos(pag);
      setComissoes(com);
      setConcluidos(ag.filter((a) => a.status === "concluido"));
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, [mes, canUse]);

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
      <div className="beauty-card">
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
    </div>
  );
}
