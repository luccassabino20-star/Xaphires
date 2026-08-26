import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { getDashboardResumo } from "../state/api.js";
import { metaFor } from "./registry.js";
import ModuleIcon from "./ModuleIcon.jsx";

function formatarValor(cents, locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}
function formatarHora(iso, locale) {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}
function tempoRelativo(iso, locale) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (min < 60) return rtf.format(-min, "minute");
  const horas = Math.round(min / 60);
  if (horas < 24) return rtf.format(-horas, "hour");
  return rtf.format(-Math.round(horas / 24), "day");
}

// Quick actions: cada uma abre o módulo dono da ação (nunca um formulário
// específico dentro dele - a casca (PlatformShell/ModuleLauncher) só sabe
// abrir um módulo pelo id, não navegar para uma aba/modal interna dele).
const ACOES_RAPIDAS = [
  { moduleId: "xaphires-beauty", tKey: "novoAgendamento" },
  { moduleId: "financeiro", tKey: "lancarVenda" },
  { moduleId: "quadro", tKey: "novaTarefa" },
];

// Um evento por tipo de atividade (ver server/routes/dashboard.js) - a chave
// de tradução e os campos que ela interpola.
function textoAtividade(t, evento) {
  switch (evento.tipo) {
    case "cliente_novo":
      return t("dashboard.atividades.clienteNovo", { nome: evento.nome });
    case "agendamento_confirmado":
      return t("dashboard.atividades.agendamentoConfirmado", { nome: evento.nome });
    case "despesa_lancada":
      return t("dashboard.atividades.despesaLancada", { descricao: evento.descricao });
    case "venda_lancada":
      return t("dashboard.atividades.vendaLancada", { descricao: evento.descricao });
    case "tarefa_criada":
      return t("dashboard.atividades.tarefaCriada", { titulo: evento.titulo });
    default:
      return null;
  }
}

// Dashboard central do Hub: agrega KPIs/atividade de todos os módulos ativos
// numa tela só. Os números vêm prontos de GET /api/dashboard/resumo (mesmo
// princípio de /api/plan e /api/modules) - este componente só desenha o que
// veio, e trata null como "módulo não habilitado" (não como zero).
export default function MainDashboardView({ modules, onOpenModule }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    getDashboardResumo()
      .then((data) => vivo && setResumo(data))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, []);

  function moduloHabilitado(id) {
    return modules.find((m) => m.id === id)?.enabled;
  }

  return (
    <div className="dash-root">
      <div className="dash-header">
        <div>
          <h1 className="dash-greeting">{t("dashboard.saudacao", { nome: user?.name || "" })}</h1>
          <p className="dash-subtitle">{t("dashboard.subtitulo")}</p>
        </div>
        <div className="dash-quick-actions">
          {ACOES_RAPIDAS.map((acao) => {
            const habilitado = moduloHabilitado(acao.moduleId);
            return (
              <button
                type="button"
                key={acao.moduleId}
                className="dash-pill-btn"
                disabled={!habilitado}
                title={habilitado ? undefined : t("modules.comingSoon")}
                onClick={() => onOpenModule(acao.moduleId)}
              >
                {t(`dashboard.acoes.${acao.tKey}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="dash-kpi-grid">
        <div className="dash-kpi-card">
          <span className="dash-kpi-label">{t("dashboard.kpis.faturamentoMes")}</span>
          {resumo && resumo.faturamentoMes !== null ? (
            <>
              <span className="dash-kpi-value">{formatarValor(resumo.faturamentoMes, i18n.language)}</span>
              {resumo.crescimentoPct !== null && (
                <span className={"dash-kpi-trend" + (resumo.crescimentoPct < 0 ? " dash-kpi-trend-down" : "")}>
                  {resumo.crescimentoPct > 0 ? "+" : ""}
                  {resumo.crescimentoPct}% {t("dashboard.kpis.vsMesAnterior")}
                </span>
              )}
            </>
          ) : (
            <span className="dash-kpi-empty">{t("dashboard.kpis.faturamentoSemDado")}</span>
          )}
        </div>

        <div className="dash-kpi-card">
          <span className="dash-kpi-label">{t("dashboard.kpis.atendimentosHoje")}</span>
          {resumo && resumo.atendimentosHoje !== null ? (
            <span className="dash-kpi-value">{resumo.atendimentosHoje}</span>
          ) : (
            <span className="dash-kpi-empty">{t("dashboard.kpis.atendimentosSemDado")}</span>
          )}
        </div>

        <div className="dash-kpi-card">
          <span className="dash-kpi-label">{t("dashboard.kpis.tarefasPendentes")}</span>
          <span className="dash-kpi-value">{resumo ? resumo.tarefasPendentes : "—"}</span>
        </div>

        <div className="dash-kpi-card">
          <span className="dash-kpi-label">{t("dashboard.kpis.ocupacaoSemana")}</span>
          {resumo && resumo.ocupacaoSemana !== null ? (
            <span className="dash-kpi-value">{resumo.ocupacaoSemana}%</span>
          ) : (
            <span className="dash-kpi-empty">{t("dashboard.kpis.ocupacaoSemDado")}</span>
          )}
        </div>
      </div>

      <div className="dash-panels">
        <div className="dash-panel">
          <h2 className="dash-panel-title">
            {t("dashboard.agendamentos.titulo")} <span className="dash-panel-subtitle">{t("dashboard.agendamentos.subtitulo")}</span>
          </h2>
          {!moduloHabilitado("xaphires-beauty") ? (
            <p className="dash-panel-empty">{t("dashboard.agendamentos.semModulo")}</p>
          ) : resumo && resumo.proximosAgendamentos.length === 0 ? (
            <p className="dash-panel-empty">{t("dashboard.agendamentos.vazio")}</p>
          ) : (
            <ul className="dash-appt-list">
              {resumo?.proximosAgendamentos.map((a) => (
                <li className="dash-appt-item" key={a.id}>
                  <span className="dash-appt-time">{formatarHora(a.startsAt, i18n.language)}</span>
                  <span className="dash-appt-info">
                    <strong>{a.clientName}</strong>
                    <span>{a.serviceName}</span>
                  </span>
                  <span className={"dash-appt-status dash-appt-status-" + a.status}>{a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dash-panel">
          <h2 className="dash-panel-title">{t("dashboard.solucoes.titulo")}</h2>
          <ul className="dash-modules-list">
            {modules.map((m) => {
              const meta = metaFor(m.id);
              return (
                <li className="dash-module-item" key={m.id}>
                  <span className={"dash-module-icon" + (m.enabled ? "" : " dash-module-icon-locked")}>
                    <ModuleIcon name={meta.icon} size={18} />
                  </span>
                  <span className="dash-module-name">{t(meta.labelKey)}</span>
                  {m.enabled ? (
                    <button type="button" className="dash-module-open" onClick={() => onOpenModule(m.id)}>
                      {t("dashboard.solucoes.entrar")} →
                    </button>
                  ) : (
                    <span className="dash-module-soon">{t("dashboard.solucoes.emBreve")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="dash-panel">
          <h2 className="dash-panel-title">{t("dashboard.atividades.titulo")}</h2>
          {resumo && resumo.atividades.length === 0 ? (
            <p className="dash-panel-empty">{t("dashboard.atividades.vazio")}</p>
          ) : (
            <ul className="dash-activity-list">
              {resumo?.atividades.map((ev, i) => (
                <li className="dash-activity-item" key={i}>
                  <span className="dash-activity-dot" aria-hidden="true" />
                  <span className="dash-activity-text">{textoAtividade(t, ev)}</span>
                  <span className="dash-activity-time">{tempoRelativo(ev.em, i18n.language)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {erro && <p className="dash-panel-empty">{t("modules.loadError")}</p>}
    </div>
  );
}
