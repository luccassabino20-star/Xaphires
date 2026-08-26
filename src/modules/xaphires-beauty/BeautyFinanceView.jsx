import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";

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

// Financeiro do módulo (Fase 2, Premium+): ledger manual de pagamento e o
// resumo de comissão por profissional, os dois no mesmo período (mês). Não é
// cobrança real - ver o comentário em schema.js sobre beauty_payments.
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
      <div className="sc-empty" style={{ padding: 40 }}>
        {t("modules.xaphiresBeauty.financeiro.bloqueado", { plano: t("plan.names.intermediate") })}
      </div>
    );
  }

  return (
    <div className="sc-cad-secao">
      <div className="sc-form" style={{ alignItems: "center" }}>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        <button type="button" className="btn-primary btn-small" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? t("common.cancel") : t("modules.xaphiresBeauty.financeiro.novoPagamento")}
        </button>
      </div>

      {mostrarForm && (
        <form className="sc-form" onSubmit={salvar}>
          <select value={f.appointmentId} onChange={(e) => escolherAtendimento(e.target.value)}>
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
            style={{ maxWidth: 110 }}
          />
          <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
            <option value="dinheiro">{t("modules.xaphiresBeauty.financeiro.metodos.dinheiro")}</option>
            <option value="pix">{t("modules.xaphiresBeauty.financeiro.metodos.pix")}</option>
            <option value="cartao">{t("modules.xaphiresBeauty.financeiro.metodos.cartao")}</option>
          </select>
          <button type="submit" className="btn-primary btn-small">{t("common.save")}</button>
        </form>
      )}

      {erro && <div className="sc-error">{erro}</div>}

      <h3 className="sc-subtitle">{t("modules.xaphiresBeauty.financeiro.pagamentos")}</h3>
      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("modules.xaphiresBeauty.financeiro.data")}</th>
              <th>{t("modules.xaphiresBeauty.clientes.nome")}</th>
              <th>{t("modules.xaphiresBeauty.financeiro.metodo")}</th>
              <th>{t("modules.xaphiresBeauty.financeiro.valor")}</th>
            </tr>
          </thead>
          <tbody>
            {pagamentos.length === 0 ? (
              <tr>
                <td colSpan={4} className="sc-empty">{t("modules.xaphiresBeauty.financeiro.vazio")}</td>
              </tr>
            ) : (
              pagamentos.map((p) => (
                <tr key={p.id}>
                  <td>{p.paid_at.slice(0, 10)}</td>
                  <td>{p.client_name}</td>
                  <td>{t(`modules.xaphiresBeauty.financeiro.metodos.${p.method}`)}</td>
                  <td>{formatarValor(p.amount_cents, i18n.language)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h3 className="sc-subtitle">{t("modules.xaphiresBeauty.financeiro.comissoes")}</h3>
      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("modules.xaphiresBeauty.equipe.nome")}</th>
              <th>{t("modules.xaphiresBeauty.financeiro.totalAtendido")}</th>
              <th>{t("modules.xaphiresBeauty.financeiro.comissao")}</th>
            </tr>
          </thead>
          <tbody>
            {comissoes.length === 0 ? (
              <tr>
                <td colSpan={3} className="sc-empty">{t("modules.xaphiresBeauty.financeiro.vazio")}</td>
              </tr>
            ) : (
              comissoes.map((c) => (
                <tr key={c.staffId}>
                  <td>{c.name}</td>
                  <td>{formatarValor(c.totalCents, i18n.language)}</td>
                  <td>{formatarValor(c.commissionCents, i18n.language)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
