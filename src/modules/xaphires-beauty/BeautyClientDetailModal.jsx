import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import Avatar from "../../components/Avatar.jsx";

function formatarValor(cents, locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}

// Ficha do cliente (Fase 5): foto, aniversário, selo de ranking e histórico
// completo de agendamentos. Usa o modal padrão do app (.modal/.modal-
// overlay, src/index.css) - infraestrutura genuinamente compartilhada,
// diferente das classes .sc-patient-* de Saúde & Clínicas, que são estilo
// próprio daquele módulo e não entram aqui (o conteúdo segue a paleta
// .beauty-* do resto do módulo). client vem do cache já carregado por
// BeautyClientsView; rankingEntry/posicao vêm do ranking já buscado lá -
// não há rota GET /clients/:id avulsa, evita uma requisição a mais.
export default function BeautyClientDetailModal({ client, rankingEntry, posicao, onClose, onUpdated }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const fileInputRef = useRef(null);
  const [birthDate, setBirthDate] = useState(client.birth_date || "");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api
      .xbGetClientAppointments(client.id)
      .then(setHistorico)
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
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

  const ehTop = posicao === 1;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal beauty-detail-modal">
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

        <div className="beauty-detail-row">
          <label className="beauty-detail-field">
            <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.clientes.aniversario")}</span>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="beauty-date-input" />
          </label>
          <button type="button" className="btn-primary" onClick={salvarAniversario} disabled={salvando}>{t("common.save")}</button>
        </div>

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
      </div>
    </div>
  );
}
