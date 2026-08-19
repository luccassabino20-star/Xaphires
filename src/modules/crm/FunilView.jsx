import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents, centsOuZero } from "../financeiro/dinheiro.js";

const VAZIO = { title: "", contactId: "", contactName: "", contactPhone: "", value: "", source: "" };

// Funil de vendas: um quadro próprio do CRM (colunas = estágios, cards =
// oportunidades), com arrastar-e-soltar nativo do navegador (draggable +
// dragstart/dragover/drop) - sem nenhuma dependência nova e sem tocar no
// BoardContext/reducer do Kanban genérico, que é um schema totalmente
// separado (ver server/modules/crm/schema.js). Solta sempre no fim da coluna
// de destino; reordenar dentro da própria coluna fica para quando o funil
// precisar disso de verdade.
export default function FunilView() {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [stages, setStages] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState(null); // null = form fechado
  const [arrastando, setArrastando] = useState(null); // id da oportunidade em arrasto

  async function carregar() {
    try {
      const [s, o, c] = await Promise.all([api.crmListStages(), api.crmListOpportunities(), api.crmListContacts()]);
      setStages(s);
      setOpportunities(o);
      setContacts(c);
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  const porEstagio = useMemo(() => {
    const mapa = new Map(stages.map((s) => [s.id, []]));
    for (const o of opportunities) {
      if (mapa.has(o.stage_id)) mapa.get(o.stage_id).push(o);
    }
    return mapa;
  }, [stages, opportunities]);

  async function criarLead(e) {
    e.preventDefault();
    if (!novo.title.trim() || (!novo.contactId && !novo.contactName.trim())) return;
    try {
      await api.crmCreateOpportunity({
        title: novo.title.trim(),
        contactId: novo.contactId || undefined,
        contactName: novo.contactId ? undefined : novo.contactName.trim(),
        contactPhone: novo.contactPhone,
        valueCents: centsOuZero(novo.value),
        source: novo.source,
      });
      showToast(t("crm.funil.leadCriado"));
      setNovo(null);
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function soltarEm(stageId) {
    const id = arrastando;
    setArrastando(null);
    if (!id) return;
    const atual = opportunities.find((o) => o.id === id);
    if (!atual || atual.stage_id === stageId) return;
    // Otimista: move na hora, sem esperar a resposta - se der erro, recarrega
    // do servidor pra desfazer sozinho.
    setOpportunities((prev) => prev.map((o) => (o.id === id ? { ...o, stage_id: stageId } : o)));
    try {
      await api.crmMoverOportunidade(id, stageId);
    } catch (err) {
      showToast(translateError(err, t));
      await carregar();
    }
  }

  return (
    <div className="sc-cad-secao">
      {erro && <div className="sc-error">{erro}</div>}

      <div className="crm-funil-topo">
        {novo ? (
          <form className="sc-form" onSubmit={criarLead}>
            <input type="text" placeholder={t("crm.funil.tituloLead")} value={novo.title} onChange={(e) => setNovo({ ...novo, title: e.target.value })} />
            <select value={novo.contactId} onChange={(e) => setNovo({ ...novo, contactId: e.target.value })}>
              <option value="">{t("crm.funil.contatoNovo")}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {!novo.contactId && (
              <>
                <input type="text" placeholder={t("crm.contatos.nome")} value={novo.contactName} onChange={(e) => setNovo({ ...novo, contactName: e.target.value })} />
                <input type="text" placeholder={t("crm.contatos.telefone")} value={novo.contactPhone} onChange={(e) => setNovo({ ...novo, contactPhone: e.target.value })} />
              </>
            )}
            <input type="number" step="0.01" placeholder={t("crm.funil.valorEstimado")} value={novo.value} onChange={(e) => setNovo({ ...novo, value: e.target.value })} />
            <input type="text" placeholder={t("crm.funil.origem")} value={novo.source} onChange={(e) => setNovo({ ...novo, source: e.target.value })} />
            <button type="submit" className="btn-primary btn-small">{t("crm.funil.criarLead")}</button>
            <button type="button" className="btn-ghost btn-small" onClick={() => setNovo(null)}>{t("common.cancel")}</button>
          </form>
        ) : (
          <button type="button" className="btn-primary btn-small" onClick={() => setNovo(VAZIO)}>{t("crm.funil.novoLead")}</button>
        )}
      </div>

      <div className="crm-board">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className="crm-column"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => soltarEm(stage.id)}
          >
            <div className="crm-column-header">
              <span>{stage.name}</span>
              <span className="crm-column-count">{(porEstagio.get(stage.id) || []).length}</span>
            </div>
            <div className="crm-column-body">
              {(porEstagio.get(stage.id) || []).map((op) => (
                <div
                  key={op.id}
                  className="crm-card"
                  draggable
                  onDragStart={() => setArrastando(op.id)}
                  onDragEnd={() => setArrastando(null)}
                >
                  <span className="crm-card-title">{op.title}</span>
                  <span className="crm-card-contact">{op.contact_name}</span>
                  {op.value_cents > 0 && <span className="crm-card-value">{formatCents(op.value_cents, i18n.language)}</span>}
                </div>
              ))}
              {(porEstagio.get(stage.id) || []).length === 0 && <p className="crm-column-empty">{t("crm.funil.colunaVazia")}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
