import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import { whatsappLink } from "../../utils/contact.js";
import * as api from "../../state/api.js";
import Avatar from "../../components/Avatar.jsx";
import BeautyEmptyState from "./BeautyEmptyState.jsx";

const BADGE_POR_STATUS = { agendado: "beauty-badge-agendado", concluido: "beauty-badge-concluido", cancelado: "beauty-badge-cancelado" };

function formatarValor(cents, locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}
function formatarDataHora(iso, lang) {
  const d = new Date(iso.slice(0, 19));
  const data = new Intl.DateTimeFormat(lang, { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const hora = iso.slice(11, 16);
  return `${data} ${hora}`;
}

// Ícones da linha do tempo - traço fino, no mesmo espírito de BeautyIcon.jsx,
// mas locais aqui porque só esta tela usa (evento não é item de navegação).
function IconeEvento({ tipo }) {
  const props = { viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  if (tipo === "concluido") return <svg {...props}><path d="M5 12l5 5L19 7" /></svg>;
  if (tipo === "cancelado") return <svg {...props}><path d="M6 6l12 12M18 6 6 18" /></svg>;
  if (tipo === "confirmado") return <svg {...props}><path d="M5 12l5 5L19 7" /></svg>;
  if (tipo === "pagamento") return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.5 10a2 2 0 0 1 2-2h1a2 2 0 1 1 0 4h-1a2 2 0 1 0 0 4h1a2 2 0 0 0 2-2" /></svg>;
  return <svg {...props}><path d="M4 5h16v16H4V5zm0 5h16M8 3v4M16 3v4" /></svg>;
}

// Tela de detalhe do atendimento (Fase 12) - abre no lugar da antiga barra
// inferior simples ao clicar num cartão da agenda. clientes/servicos/equipe
// vêm já carregados de BeautyAgendaView (evita rebuscar pra montar os
// selects de edição); onChanged() é o carregarAgenda() de lá, chamado depois
// de qualquer mutação bem-sucedida pra manter a grade sincronizada.
export default function AppointmentDetailView({ appointment, clientes, servicos, equipe, onClose, onChanged, onDuplicate }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [atual, setAtual] = useState(appointment);
  const [aba, setAba] = useState("detalhes");
  const [modoEdicao, setModoEdicao] = useState(false);
  const [fEdit, setFEdit] = useState(null);
  const [pagamentos, setPagamentos] = useState([]);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.xbGetAppointmentPayments(atual.id).then(setPagamentos).catch(() => setPagamentos([]));
    // eslint-disable-next-line
  }, [atual.id]);

  const staffAtual = equipe.find((s) => s.id === atual.staff_id);

  function entrarEdicao() {
    setFEdit({
      clientId: atual.client_id,
      serviceId: atual.service_id,
      staffId: atual.staff_id || "",
      date: atual.starts_at.slice(0, 10),
      time: atual.starts_at.slice(11, 16),
      notes: atual.notes || "",
    });
    setModoEdicao(true);
  }

  async function salvarEdicao(e) {
    e.preventDefault();
    if (!fEdit.clientId || !fEdit.serviceId || !fEdit.date || !fEdit.time) return;
    setSalvando(true);
    try {
      const atualizado = await api.xbUpdateAppointment(atual.id, {
        clientId: fEdit.clientId,
        serviceId: fEdit.serviceId,
        staffId: fEdit.staffId || null,
        startsAt: `${fEdit.date}T${fEdit.time}:00`,
        notes: fEdit.notes,
      });
      setAtual(atualizado);
      setModoEdicao(false);
      showToast(t("modules.xaphiresBeauty.atendimento.atualizado"));
      onChanged();
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(status) {
    setSalvando(true);
    try {
      const atualizado = await api.xbSetAppointmentStatus(atual.id, status);
      setAtual(atualizado);
      setConfirmandoCancelar(false);
      onChanged();
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  async function copiarLinkLembrete() {
    try {
      const { slug } = await api.xbGetReminderLink(atual.id);
      const url = `${window.location.origin}/beauty-lembrete/${slug}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast(t("modules.xaphiresBeauty.agenda.linkCopiado"));
      } catch {
        window.prompt(t("modules.xaphiresBeauty.agenda.linkLembrete"), url);
      }
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  // Mais recente primeiro - só entram eventos com carimbo real (ver comentário
  // da Fase 12 em schema.js: nada aqui é aproximado ou inventado).
  const eventos = useMemo(() => {
    const lista = [{ tipo: "criado", quando: atual.created_at, label: t("modules.xaphiresBeauty.atendimento.eventoCriado") }];
    if (atual.confirmed_at) lista.push({ tipo: "confirmado", quando: atual.confirmed_at, label: t("modules.xaphiresBeauty.atendimento.eventoConfirmado") });
    for (const p of pagamentos) {
      lista.push({
        tipo: "pagamento",
        quando: p.paid_at,
        label: t("modules.xaphiresBeauty.atendimento.eventoPagamento", { metodo: p.method }) + ` · ${formatarValor(p.amount_cents, i18n.language)}`,
      });
    }
    if (atual.completed_at) lista.push({ tipo: "concluido", quando: atual.completed_at, label: t("modules.xaphiresBeauty.atendimento.eventoConcluido") });
    if (atual.cancelled_at) lista.push({ tipo: "cancelado", quando: atual.cancelled_at, label: t("modules.xaphiresBeauty.atendimento.eventoCancelado") });
    return lista.sort((a, b) => b.quando.localeCompare(a.quando));
  }, [atual, pagamentos, t, i18n.language]);

  const horaFim = atual.ends_at.slice(11, 16);
  const dataFormatada = new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(atual.starts_at.slice(0, 10) + "T00:00:00"));

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-wide beauty-appointment-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        <div className="beauty-apt-header">
          <div>
            <h2 className="beauty-apt-title">{t("modules.xaphiresBeauty.atendimento.titulo")}</h2>
            <p className="beauty-apt-subtitle">{atual.client_name} · {atual.service_name}</p>
          </div>
          {atual.status === "agendado" && !modoEdicao && (
            <div className="beauty-apt-header-actions">
              <button type="button" className="btn-ghost" onClick={entrarEdicao}>✏️ {t("modules.xaphiresBeauty.atendimento.editar")}</button>
              <button type="button" className="btn-primary" disabled={salvando} onClick={() => mudarStatus("concluido")}>✓ {t("modules.xaphiresBeauty.atendimento.finalizar")}</button>
            </div>
          )}
        </div>

        {atual.status === "agendado" && !modoEdicao && (
          <div className="beauty-apt-quick-actions">
            <button type="button" onClick={() => { onDuplicate(atual); onClose(); }}>{t("modules.xaphiresBeauty.agenda.duplicar")}</button>
            <button type="button" onClick={copiarLinkLembrete}>{t("modules.xaphiresBeauty.atendimento.linkLembrete")}</button>
            {confirmandoCancelar ? (
              <>
                <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.atendimento.confirmarCancelar")}</span>
                <button type="button" className="beauty-apt-cancelar" disabled={salvando} onClick={() => mudarStatus("cancelado")}>{t("modules.xaphiresBeauty.atendimento.cancelar")}</button>
                <button type="button" onClick={() => setConfirmandoCancelar(false)}>{t("common.cancel")}</button>
              </>
            ) : (
              <button type="button" className="beauty-apt-cancelar" onClick={() => setConfirmandoCancelar(true)}>{t("modules.xaphiresBeauty.atendimento.cancelar")}</button>
            )}
          </div>
        )}

        <div className="beauty-apt-tabs">
          <button type="button" className={"beauty-apt-tab" + (aba === "detalhes" ? " active" : "")} onClick={() => setAba("detalhes")}>
            {t("modules.xaphiresBeauty.atendimento.abaDetalhes")}
          </button>
          <button type="button" className={"beauty-apt-tab" + (aba === "anamnese" ? " active" : "")} onClick={() => setAba("anamnese")}>
            {t("modules.xaphiresBeauty.atendimento.abaAnamnese")}
          </button>
        </div>

        <div className="modal-body">
          {aba === "anamnese" ? (
            <BeautyEmptyState title={t("modules.xaphiresBeauty.emBreve.titulo")} text={t("modules.xaphiresBeauty.emBreve.texto")} />
          ) : modoEdicao ? (
            <form className="beauty-form" onSubmit={salvarEdicao} style={{ padding: "18px 0" }}>
              <select value={fEdit.clientId} onChange={(e) => setFEdit({ ...fEdit, clientId: e.target.value })}>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select value={fEdit.serviceId} onChange={(e) => setFEdit({ ...fEdit, serviceId: e.target.value })}>
                {servicos.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select value={fEdit.staffId} onChange={(e) => setFEdit({ ...fEdit, staffId: e.target.value })}>
                <option value="">{t("modules.xaphiresBeauty.agenda.semPreferencia")}</option>
                {equipe.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input type="date" value={fEdit.date} onChange={(e) => setFEdit({ ...fEdit, date: e.target.value })} />
              <input type="time" step={900} value={fEdit.time} onChange={(e) => setFEdit({ ...fEdit, time: e.target.value })} />
              <input type="text" placeholder={t("modules.xaphiresBeauty.agenda.notas")} value={fEdit.notes} onChange={(e) => setFEdit({ ...fEdit, notes: e.target.value })} />
              <button type="submit" className="btn-primary" disabled={salvando}>{t("modules.xaphiresBeauty.atendimento.salvarEdicao")}</button>
              <button type="button" className="btn-ghost" onClick={() => setModoEdicao(false)}>{t("modules.xaphiresBeauty.atendimento.cancelarEdicao")}</button>
            </form>
          ) : (
            <>
              <div className="beauty-apt-card">
                <div className="beauty-apt-card-top">
                  <span className="beauty-apt-datetime">{dataFormatada} - {atual.starts_at.slice(11, 16)} - {horaFim}</span>
                  <span className={"beauty-badge " + BADGE_POR_STATUS[atual.status]}>{t(`modules.xaphiresBeauty.agenda.status.${atual.status}`)}</span>
                </div>
                <div className="beauty-apt-grid">
                  <div>
                    <span className="beauty-apt-label">{t("modules.xaphiresBeauty.atendimento.cliente")}</span>
                    <div className="beauty-apt-value-primary">{atual.client_name}</div>
                    {atual.client_phone && (
                      <a className="beauty-apt-whatsapp" href={whatsappLink(atual.client_phone, "")} target="_blank" rel="noopener noreferrer">
                        {atual.client_phone} · {t("modules.xaphiresBeauty.atendimento.whatsapp")}
                      </a>
                    )}
                  </div>
                  <div>
                    <span className="beauty-apt-label">{t("modules.xaphiresBeauty.atendimento.profissional")}</span>
                    {atual.staff_name ? (
                      <div className="beauty-apt-staff">
                        <Avatar id={atual.staff_id} name={atual.staff_name} style={{ background: staffAtual?.color }} />
                        {atual.staff_name}
                      </div>
                    ) : (
                      <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.atendimento.semProfissional")}</span>
                    )}
                  </div>
                </div>
                <div className="beauty-apt-footer-meta">
                  <span>{t("modules.xaphiresBeauty.atendimento.agendamentoOnline")}: <strong>{t(`modules.xaphiresBeauty.atendimento.${atual.from_public_link ? "sim" : "nao"}`)}</strong></span>
                  <span>
                    {t("modules.xaphiresBeauty.atendimento.confirmadoPeloCliente")}:{" "}
                    <strong className={atual.confirmed_at ? "beauty-texto-confirmado" : ""}>
                      {atual.confirmed_at ? formatarDataHora(atual.confirmed_at, i18n.language) : t("modules.xaphiresBeauty.atendimento.pendente")}
                    </strong>
                  </span>
                </div>
              </div>

              <h3 className="beauty-apt-section-title">{t("modules.xaphiresBeauty.atendimento.servicos")}</h3>
              <table className="beauty-apt-table">
                <thead>
                  <tr>
                    <th>{t("modules.xaphiresBeauty.atendimento.colServico")}</th>
                    <th className="beauty-apt-num">{t("modules.xaphiresBeauty.atendimento.colDuracao")}</th>
                    <th className="beauty-apt-num">{t("modules.xaphiresBeauty.atendimento.colValor")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{atual.service_name}</td>
                    <td className="beauty-apt-num">{t("modules.xaphiresBeauty.atendimento.minutos", { count: atual.duration_minutes })}</td>
                    <td className="beauty-apt-num">{formatarValor(atual.price_cents, i18n.language)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>{t("modules.xaphiresBeauty.atendimento.total")}</td>
                    <td className="beauty-apt-num">{formatarValor(atual.price_cents, i18n.language)}</td>
                  </tr>
                </tfoot>
              </table>

              <h3 className="beauty-apt-section-title">⏱ {t("modules.xaphiresBeauty.atendimento.oQueAconteceu")}</h3>
              <div className="beauty-apt-timeline">
                {eventos.map((ev, i) => (
                  <div className="beauty-apt-timeline-item" key={i}>
                    <span className="beauty-apt-timeline-icon"><IconeEvento tipo={ev.tipo} /></span>
                    <span className="beauty-apt-timeline-label">{ev.label}</span>
                    <span className="beauty-apt-timeline-time">{formatarDataHora(ev.quando, i18n.language)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
