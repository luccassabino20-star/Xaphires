import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import Avatar from "../../components/Avatar.jsx";
import BeautyClientProfileTabs from "./BeautyClientProfileTabs.jsx";

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
//
// O conteúdo de cada aba (Geral/Ficha Técnica/Histórico) mora em
// BeautyClientProfileTabs.jsx, reaproveitado também dentro do modal de
// atendimento (AppointmentDetailView.jsx) - aqui só ficam o cabeçalho (foto,
// nome) e a própria navegação de aba, que não fazem sentido lá.
export default function BeautyClientDetailModal({ client, rankingEntry, posicao, onClose, onUpdated }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const fileInputRef = useRef(null);
  const [aba, setAba] = useState("geral");
  const [enviandoFoto, setEnviandoFoto] = useState(false);

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
          <BeautyClientProfileTabs client={client} rankingEntry={rankingEntry} posicao={posicao} aba={aba} onUpdated={onUpdated} />
        </div>
      </div>
    </div>
  );
}
