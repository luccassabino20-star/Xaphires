import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatarValor(cents, locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}

// "Visão geral" (item novo do redesenho do menu): números totais do
// cadastro (GET /config, já existente desde a Fase 0) + o recorte de hoje
// (agendamentos e faturamento), sem tabela nova - agrega o que as outras
// telas já carregam separadamente.
export default function BeautyOverviewView() {
  const { t, i18n } = useTranslation();
  const [resumo, setResumo] = useState(null);
  const [agendamentosHoje, setAgendamentosHoje] = useState(null);
  const [faturamentoHoje, setFaturamentoHoje] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const hoje = hojeCivil();
    const from = `${hoje}T00:00:00`;
    const to = `${hoje}T23:59:59`;
    Promise.all([api.xbGetConfig(), api.xbGetAppointments(from, to), api.xbGetPayments(from, to).catch(() => [])])
      .then(([cfg, ags, pagamentos]) => {
        setResumo(cfg);
        setAgendamentosHoje(ags.filter((a) => a.status !== "cancelado").length);
        setFaturamentoHoje(pagamentos.reduce((s, p) => s + p.amount_cents, 0));
      })
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, []);

  return (
    <div>
      <div className="beauty-page-head">
        <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.visaoGeral")}</h2>
      </div>
      {erro && <div className="beauty-error">{erro}</div>}
      <div className="beauty-metrics">
        <div className="beauty-metric-card">
          <span className="beauty-metric-value">{agendamentosHoje ?? "—"}</span>
          <span className="beauty-metric-label">{t("modules.xaphiresBeauty.visaoGeral.agendamentosHoje")}</span>
        </div>
        <div className="beauty-metric-card">
          <span className="beauty-metric-value">{faturamentoHoje != null ? formatarValor(faturamentoHoje, i18n.language) : "—"}</span>
          <span className="beauty-metric-label">{t("modules.xaphiresBeauty.visaoGeral.faturamentoHoje")}</span>
        </div>
        <div className="beauty-metric-card">
          <span className="beauty-metric-value">{resumo?.clients ?? "—"}</span>
          <span className="beauty-metric-label">{t("modules.xaphiresBeauty.visaoGeral.clientesAtivos")}</span>
        </div>
        <div className="beauty-metric-card">
          <span className="beauty-metric-value">{resumo?.services ?? "—"}</span>
          <span className="beauty-metric-label">{t("modules.xaphiresBeauty.visaoGeral.servicosCadastrados")}</span>
        </div>
      </div>
    </div>
  );
}
