import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import Avatar from "../../components/Avatar.jsx";

function formatarValor(cents, locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}
function formatarDataHora(iso, lang) {
  return new Intl.DateTimeFormat(lang, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const CAMPOS_FICHA = ["nailsShape", "nailsSize", "nailsColor", "lashMapping", "lashCurvature", "lashThickness", "lashStyle", "hairTone", "hairChemicalHistory", "hairSensitivity"];
function fichaVazia(client) {
  const campo = (nome) => client[nome.replace(/[A-Z]/g, (l) => "_" + l.toLowerCase())] || "";
  return Object.fromEntries(CAMPOS_FICHA.map((c) => [c, campo(c)]));
}

// Ficha do cliente (Fase 5, virou tabulada na Fase 13): Geral (foto,
// aniversário, alerta de alergia/restrição, histórico de atendimentos),
// Ficha Técnica (unhas/cílios/cabelo) e Histórico de observações (diário
// datado, diferente da ficha técnica que é "estado atual"). Usa o modal
// padrão do app (.modal/.modal-overlay/.modal-wide, src/index.css) -
// infraestrutura genuinamente compartilhada, diferente das classes
// .sc-patient-* de Saúde & Clínicas, que são estilo próprio daquele módulo e
// não entram aqui. client vem do cache já carregado por BeautyClientsView;
// rankingEntry/posicao vêm do ranking já buscado lá - não há rota
// GET /clients/:id avulsa, evita uma requisição a mais.
export default function BeautyClientDetailModal({ client, rankingEntry, posicao, onClose, onUpdated }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const fileInputRef = useRef(null);
  const [aba, setAba] = useState("geral");
  const [birthDate, setBirthDate] = useState(client.birth_date || "");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState(null);
  const [erro, setErro] = useState("");
  const [fFicha, setFFicha] = useState(() => fichaVazia(client));
  const [salvandoFicha, setSalvandoFicha] = useState(false);
  const [observacoes, setObservacoes] = useState(null);
  const [novaObservacao, setNovaObservacao] = useState("");
  const [enviandoObservacao, setEnviandoObservacao] = useState(false);

  useEffect(() => {
    api
      .xbGetClientAppointments(client.id)
      .then(setHistorico)
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, [client.id]);

  useEffect(() => {
    api.xbGetClientNotes(client.id).then(setObservacoes).catch(() => setObservacoes([]));
  }, [client.id]);

  const fotoUrl = useMemo(
    () => (client.avatar_path ? `/api/xaphires-beauty/clients/${client.id}/photo?v=${client.avatar_path}` : null),
    [client]
  );

  async function enviarFoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEnviandoFoto(true);
    try {
      const atualizado = await api.xbUploadClientPhoto(client.id, file);
      onUpdated(atualizado);
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function salvarAniversario() {
    setSalvando(true);
    try {
      const atualizado = await api.xbUpdateClient(client.id, { birthDate: birthDate || null });
      onUpdated(atualizado);
      showToast(t("modules.xaphiresBeauty.clientes.salvo"));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  async function salvarFicha(e) {
    e.preventDefault();
    setSalvandoFicha(true);
    try {
      const atualizado = await api.xbUpdateClient(client.id, fFicha);
      onUpdated(atualizado);
      showToast(t("modules.xaphiresBeauty.clientes.fichaSalva"));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvandoFicha(false);
    }
  }

  async function adicionarObservacao(e) {
    e.preventDefault();
    if (!novaObservacao.trim()) return;
    setEnviandoObservacao(true);
    try {
      const criada = await api.xbCreateClientNote(client.id, novaObservacao.trim());
      setObservacoes((atual) => [criada, ...(atual || [])]);
      setNovaObservacao("");
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setEnviandoObservacao(false);
    }
  }

  const ehTop = posicao === 1;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-wide beauty-detail-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        <div className="beauty-detail-head">
          <div className="beauty-detail-avatar">
            <Avatar id={client.id} name={client.name} avatarUrl={fotoUrl} className="avatar-large" />
            <button type="button" className="beauty-avatar-edit" onClick={() => fileInputRef.current?.click()} disabled={enviandoFoto} title={t("modules.xaphiresBeauty.clientes.editarFoto")}>
              <svg viewBox="0 0 24 24" width="13" height="13"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m4 20 1-4L18 3l3 3L8 19l-4 1zM14 6l4 4" /></svg>
            </button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={enviarFoto} />
          </div>
          <div>
            <h2 className="beauty-page-title" style={{ marginBottom: 4 }}>{client.name}</h2>
            <p className="beauty-cell-muted">{client.phone || "—"}</p>
            {rankingEntry && (
              <span className={"beauty-badge " + (ehTop ? "beauty-badge-concluido" : "beauty-badge-agendado")}>
                {ehTop ? t("modules.xaphiresBeauty.clientes.maiorFaturamento") : t("modules.xaphiresBeauty.clientes.clienteFrequente")}
              </span>
            )}
          </div>
        </div>

        <div className="beauty-tabs">
          <button type="button" className={"beauty-tab" + (aba === "geral" ? " active" : "")} onClick={() => setAba("geral")}>
            {t("modules.xaphiresBeauty.clientes.abaGeral")}
          </button>
          <button type="button" className={"beauty-tab" + (aba === "ficha" ? " active" : "")} onClick={() => setAba("ficha")}>
            {t("modules.xaphiresBeauty.clientes.abaFichaTecnica")}
          </button>
          <button type="button" className={"beauty-tab" + (aba === "historico" ? " active" : "")} onClick={() => setAba("historico")}>
            {t("modules.xaphiresBeauty.clientes.abaHistorico")}
          </button>
        </div>

        <div className="modal-body">
          {aba === "geral" && (
            <>
              {client.notes && (
                <div className="beauty-alert-box">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0z" />
                  </svg>
                  <div>
                    <strong style={{ display: "block", marginBottom: 2 }}>{t("modules.xaphiresBeauty.clientes.alertaTitulo")}</strong>
                    {client.notes}
                  </div>
                </div>
              )}

              <div className="beauty-detail-row">
                <label className="beauty-detail-field">
                  <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.aniversario")}</span>
                  <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="beauty-date-input" />
                </label>
                <button type="button" className="btn-primary" onClick={salvarAniversario} disabled={salvando}>{t("common.save")}</button>
              </div>
              {client.doc && (
                <p className="beauty-cell-muted" style={{ margin: "0 0 14px" }}>{t("modules.xaphiresBeauty.clientes.doc")}: {client.doc}</p>
              )}

              {rankingEntry && (
                <p className="beauty-cell-muted" style={{ margin: "4px 0 18px" }}>
                  {t("modules.xaphiresBeauty.clientes.resumoRanking", { visitas: rankingEntry.visits, total: formatarValor(rankingEntry.total_cents, i18n.language) })}
                </p>
              )}

              <h3 className="beauty-section-title">{t("modules.xaphiresBeauty.clientes.historico")}</h3>
              {erro && <div className="beauty-error">{erro}</div>}
              {historico === null ? (
                <p className="beauty-cell-muted">{t("common.loading")}</p>
              ) : historico.length === 0 ? (
                <p className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.semHistorico")}</p>
              ) : (
                <div className="beauty-list beauty-detail-historico">
                  {historico.map((a) => (
                    <div className="beauty-list-row" key={a.id}>
                      <span className="beauty-cell-primary" style={{ flex: 1 }}>{a.starts_at.slice(0, 10)}</span>
                      <span className="beauty-cell-muted" style={{ flex: 1.4 }}>{a.service_name}</span>
                      <span className="beauty-cell-muted" style={{ flex: 1 }}>{a.staff_name || "—"}</span>
                      <span>{t(`modules.xaphiresBeauty.agenda.status.${a.status}`)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {aba === "ficha" && (
            <form onSubmit={salvarFicha}>
              <div className="beauty-tech-grid">
                <div className="beauty-tech-block">
                  <h4 className="beauty-tech-block-title">{t("modules.xaphiresBeauty.clientes.blocoUnhas")}</h4>
                  <label className="beauty-detail-field">
                    <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.unhasFormato")}</span>
                    <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.unhasFormatoPlaceholder")} value={fFicha.nailsShape} onChange={(e) => setFFicha({ ...fFicha, nailsShape: e.target.value })} />
                  </label>
                  <label className="beauty-detail-field">
                    <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.unhasTamanho")}</span>
                    <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.unhasTamanhoPlaceholder")} value={fFicha.nailsSize} onChange={(e) => setFFicha({ ...fFicha, nailsSize: e.target.value })} />
                  </label>
                  <label className="beauty-detail-field">
                    <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.unhasCor")}</span>
                    <input type="text" value={fFicha.nailsColor} onChange={(e) => setFFicha({ ...fFicha, nailsColor: e.target.value })} />
                  </label>
                </div>

                <div className="beauty-tech-block">
                  <h4 className="beauty-tech-block-title">{t("modules.xaphiresBeauty.clientes.blocoCilios")}</h4>
                  <label className="beauty-detail-field">
                    <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.ciliosMapeamento")}</span>
                    <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.ciliosMapeamentoPlaceholder")} value={fFicha.lashMapping} onChange={(e) => setFFicha({ ...fFicha, lashMapping: e.target.value })} />
                  </label>
                  <label className="beauty-detail-field">
                    <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.ciliosCurvatura")}</span>
                    <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.ciliosCurvaturaPlaceholder")} value={fFicha.lashCurvature} onChange={(e) => setFFicha({ ...fFicha, lashCurvature: e.target.value })} />
                  </label>
                  <label className="beauty-detail-field">
                    <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.ciliosEspessura")}</span>
                    <input type="text" value={fFicha.lashThickness} onChange={(e) => setFFicha({ ...fFicha, lashThickness: e.target.value })} />
                  </label>
                  <label className="beauty-detail-field">
                    <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.ciliosEstilo")}</span>
                    <input type="text" value={fFicha.lashStyle} onChange={(e) => setFFicha({ ...fFicha, lashStyle: e.target.value })} />
                  </label>
                </div>

                <div className="beauty-tech-block">
                  <h4 className="beauty-tech-block-title">{t("modules.xaphiresBeauty.clientes.blocoCabelo")}</h4>
                  <label className="beauty-detail-field">
                    <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.cabeloTom")}</span>
                    <input type="text" value={fFicha.hairTone} onChange={(e) => setFFicha({ ...fFicha, hairTone: e.target.value })} />
                  </label>
                  <label className="beauty-detail-field">
                    <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.cabeloHistoricoQuimica")}</span>
                    <input type="text" value={fFicha.hairChemicalHistory} onChange={(e) => setFFicha({ ...fFicha, hairChemicalHistory: e.target.value })} />
                  </label>
                  <label className="beauty-detail-field">
                    <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.cabeloSensibilidade")}</span>
                    <input type="text" value={fFicha.hairSensitivity} onChange={(e) => setFFicha({ ...fFicha, hairSensitivity: e.target.value })} />
                  </label>
                </div>
              </div>
              <button type="submit" className="btn-primary" style={{ marginTop: 20 }} disabled={salvandoFicha}>{t("common.save")}</button>
            </form>
          )}

          {aba === "historico" && (
            <>
              <h3 className="beauty-section-title">{t("modules.xaphiresBeauty.clientes.historicoObservacoes")}</h3>
              <form className="beauty-notes-form" onSubmit={adicionarObservacao}>
                <textarea
                  placeholder={t("modules.xaphiresBeauty.clientes.novaObservacaoPlaceholder")}
                  value={novaObservacao}
                  onChange={(e) => setNovaObservacao(e.target.value)}
                />
                <button type="submit" className="btn-primary" disabled={enviandoObservacao || !novaObservacao.trim()}>
                  {t("modules.xaphiresBeauty.clientes.adicionarObservacao")}
                </button>
              </form>
              {observacoes === null ? (
                <p className="beauty-cell-muted">{t("common.loading")}</p>
              ) : observacoes.length === 0 ? (
                <p className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.semObservacoes")}</p>
              ) : (
                <div className="beauty-notes-timeline">
                  {observacoes.map((o) => (
                    <div className="beauty-notes-timeline-item" key={o.id}>
                      <span className="beauty-notes-timeline-date">{formatarDataHora(o.created_at, i18n.language)}</span>
                      <p className="beauty-notes-timeline-text">{o.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
