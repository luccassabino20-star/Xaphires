import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyEmptyState from "./BeautyEmptyState.jsx";
import BeautyClientDetailModal from "./BeautyClientDetailModal.jsx";
import Avatar from "../../components/Avatar.jsx";

const VAZIO = { name: "", phone: "", doc: "", notes: "", birthDate: "" };

function limitesDoMes() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = d.getMonth() + 1;
  const de = `${ano}-${String(mes).padStart(2, "0")}-01T00:00:00`;
  const proximo = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  return { from: de, to: `${proximo}-01T00:00:00` };
}
function formatarValor(cents, locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}
// Campos da ficha técnica (Fase 13) - mesma lista de repo.js, só pra decidir
// se a pílula "ficha preenchida" aparece na linha (qualquer um preenchido já
// conta, não precisa dos dez).
const CAMPOS_FICHA_TECNICA = [
  "nails_shape", "nails_size", "nails_color", "lash_mapping", "lash_curvature",
  "lash_thickness", "lash_style", "hair_tone", "hair_chemical_history", "hair_sensitivity",
];
function temAlerta(c) {
  return !!(c.notes && c.notes.trim());
}
function temFichaPreenchida(c) {
  return c.notes_count > 0 || CAMPOS_FICHA_TECNICA.some((campo) => c[campo] && c[campo].trim());
}

// Cadastro de clientes: cartão de formulário + lista em linhas limpas. doc é
// opcional (CPF/CNPJ), mas quando preenchido o servidor valida o dígito
// verificador (server/doc.js). Fase 5: foto/aniversário/ranking vivem no
// painel de detalhe (BeautyClientDetailModal.jsx); aqui só as métricas
// rápidas do topo e o atalho "Ver detalhes" por linha.
export default function BeautyClientsView() {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [clientes, setClientes] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [aniversariantes, setAniversariantes] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [detalheId, setDetalheId] = useState(null);

  async function carregar() {
    const { from, to } = limitesDoMes();
    try {
      const [cs, rk, bd] = await Promise.all([
        api.xbGetClients(),
        api.xbGetClientRanking(from, to),
        api.xbGetUpcomingBirthdays(30),
      ]);
      setClientes(cs);
      setRanking(rk);
      setAniversariantes(bd);
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  function rankingDoCliente(id) {
    const idx = ranking.findIndex((r) => r.client_id === id);
    return idx === -1 ? { entry: null, posicao: null } : { entry: ranking[idx], posicao: idx + 1 };
  }

  function editar(c) {
    setEditandoId(c.id);
    setF({ name: c.name, phone: c.phone || "", doc: c.doc || "", notes: c.notes || "", birthDate: c.birth_date || "" });
  }
  function cancelar() {
    setEditandoId(null);
    setF(VAZIO);
  }

  async function salvar(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    try {
      if (editandoId) await api.xbUpdateClient(editandoId, f);
      else await api.xbCreateClient(f);
      showToast(t("modules.xaphiresBeauty.clientes.salvo"));
      cancelar();
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  // "Mais detalhes/Ficha técnica" (Fase 13) - o cadastro rápido não tem
  // campo pra unhas/cílios/cabelo (viraria um formulário enorme só de olhar);
  // em vez disso salva o que já foi digitado (nome/telefone/doc/observações)
  // e abre o drawer completo na hora, pronto pra preencher o resto.
  async function salvarEAbrirFicha() {
    if (!f.name.trim()) return;
    try {
      const salvo = editandoId ? await api.xbUpdateClient(editandoId, f) : await api.xbCreateClient(f);
      cancelar();
      await carregar();
      setDetalheId(salvo.id);
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function remover(c) {
    if (!window.confirm(t("modules.xaphiresBeauty.clientes.confirmarRemover", { nome: c.name }))) return;
    try {
      await api.xbDeleteClient(c.id);
      showToast(t("modules.xaphiresBeauty.clientes.removido"));
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  function aoAtualizarCliente(atualizado) {
    setClientes((cs) => cs.map((c) => (c.id === atualizado.id ? atualizado : c)));
  }

  const clienteDetalhe = detalheId ? clientes.find((c) => c.id === detalheId) : null;
  const maiorFaturamento = ranking[0];

  return (
    <div>
      <div className="beauty-page-head">
        <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.clientes")}</h2>
      </div>

      <div className="beauty-metrics">
        <div className="beauty-metric-card">
          <span className="beauty-metric-value">{clientes.length}</span>
          <span className="beauty-metric-label">{t("modules.xaphiresBeauty.clientes.metricaTotal")}</span>
        </div>
        <div className="beauty-metric-card">
          <span className="beauty-metric-value">{aniversariantes.length}</span>
          <span className="beauty-metric-label">{t("modules.xaphiresBeauty.clientes.metricaAniversariantes")}</span>
        </div>
        <div className="beauty-metric-card">
          <span className="beauty-metric-value">{maiorFaturamento ? formatarValor(maiorFaturamento.total_cents, i18n.language) : "—"}</span>
          <span className="beauty-metric-label">
            {maiorFaturamento ? t("modules.xaphiresBeauty.clientes.metricaTopCliente", { nome: maiorFaturamento.name }) : t("modules.xaphiresBeauty.clientes.metricaSemDados")}
          </span>
        </div>
      </div>

      <div className="beauty-card" style={{ marginBottom: 18 }}>
        <form className="beauty-form" onSubmit={salvar}>
          <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.nome")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.telefone")} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.doc")} value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })} />
          <input type="date" title={t("modules.xaphiresBeauty.clientes.aniversario")} value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} />
          <input
            type="text"
            placeholder={t("modules.xaphiresBeauty.clientes.notasPlaceholder")}
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
            style={{ flex: 2, minWidth: 220 }}
          />
          <button type="submit" className="btn-primary">{editandoId ? t("common.save") : t("common.add")}</button>
          <button type="button" className="btn-ghost" onClick={salvarEAbrirFicha}>{t("modules.xaphiresBeauty.clientes.maisDetalhes")}</button>
          {editandoId && <button type="button" className="btn-ghost" onClick={cancelar}>{t("common.cancel")}</button>}
        </form>
      </div>

      {erro && <div className="beauty-error">{erro}</div>}

      <div className="beauty-card">
        {clientes.length === 0 ? (
          <BeautyEmptyState title={t("modules.xaphiresBeauty.clientes.vazio")} />
        ) : (
          <div className="beauty-list">
            <div className="beauty-list-head">
              <span style={{ flex: 1.4 }}>{t("modules.xaphiresBeauty.clientes.nome")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.clientes.telefone")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.clientes.doc")}</span>
            </div>
            {clientes.map((c) => {
              const fotoUrl = c.avatar_path ? `/api/xaphires-beauty/clients/${c.id}/photo?v=${c.avatar_path}` : null;
              return (
                <div className="beauty-list-row" key={c.id}>
                  <span className="beauty-cell-primary" style={{ flex: 1.4, display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar id={c.id} name={c.name} avatarUrl={fotoUrl} />
                    {c.name}
                    {temAlerta(c) && <span className="beauty-badge beauty-badge-alerta-cliente">{t("modules.xaphiresBeauty.clientes.badgeAlergia")}</span>}
                    {temFichaPreenchida(c) && <span className="beauty-badge beauty-badge-ficha">{t("modules.xaphiresBeauty.clientes.badgeFichaPreenchida")}</span>}
                  </span>
                  <span className="beauty-cell-muted" style={{ flex: 1 }}>{c.phone || "—"}</span>
                  <span className="beauty-cell-muted" style={{ flex: 1 }}>{c.doc || "—"}</span>
                  <span className="beauty-col-actions">
                    <button type="button" className="btn-ghost" onClick={() => setDetalheId(c.id)}>{t("modules.xaphiresBeauty.clientes.verDetalhes")}</button>
                    <button type="button" className="btn-ghost" onClick={() => editar(c)}>{t("financeiro.cad.editar")}</button>
                    <button type="button" className="btn-ghost" onClick={() => remover(c)}>{t("common.remove")}</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {clienteDetalhe && (
        <BeautyClientDetailModal
          client={clienteDetalhe}
          rankingEntry={rankingDoCliente(clienteDetalhe.id).entry}
          posicao={rankingDoCliente(clienteDetalhe.id).posicao}
          onClose={() => setDetalheId(null)}
          onUpdated={aoAtualizarCliente}
        />
      )}
    </div>
  );
}
