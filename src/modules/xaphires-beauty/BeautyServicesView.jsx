import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyEmptyState from "./BeautyEmptyState.jsx";
import Avatar from "../../components/Avatar.jsx";

const VAZIO = { name: "", durationMinutes: "30", price: "", category: "" };

function formatarValor(cents, locale) {
  if (cents === null || cents === undefined) return "-";
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(cents / 100);
}
function limitesDoMes() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = d.getMonth() + 1;
  const de = `${ano}-${String(mes).padStart(2, "0")}-01T00:00:00`;
  const proximo = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  return { from: de, to: `${proximo}-01T00:00:00` };
}

// Catálogo de serviços: duração em minutos e preço em reais no formulário
// (convertido para centavos inteiros ao salvar - dinheiro nunca em float,
// mesma regra de plans.js/PlanModal.jsx). Fase 6: category é texto livre (o
// salão decide as próprias categorias), a lista agrupa por ela no cliente
// (sem rota nova), foto por serviço reaproveita o mesmo desenho da foto de
// cliente (Fase 5), e o ranking soma popularidade/faturamento do período,
// mesmo padrão de agregação no servidor de getClientRanking.
export default function BeautyServicesView() {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [servicos, setServicos] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [enviandoFotoId, setEnviandoFotoId] = useState(null);
  const fileInputRef = useRef(null);
  const alvoUploadRef = useRef(null);

  async function carregar() {
    const { from, to } = limitesDoMes();
    try {
      const [ss, rk] = await Promise.all([api.xbGetServices(), api.xbGetServiceRanking(from, to)]);
      setServicos(ss);
      setRanking(rk);
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  function editar(s) {
    setEditandoId(s.id);
    setF({ name: s.name, durationMinutes: String(s.duration_minutes), price: String(s.price_cents / 100), category: s.category || "" });
  }
  function cancelar() {
    setEditandoId(null);
    setF(VAZIO);
  }

  async function salvar(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    const durationMinutes = Math.max(1, Math.round(Number(f.durationMinutes) || 30));
    const priceCents = Math.max(0, Math.round((Number(f.price.replace(",", ".")) || 0) * 100));
    try {
      if (editandoId) await api.xbUpdateService(editandoId, { name: f.name, durationMinutes, priceCents, category: f.category });
      else await api.xbCreateService({ name: f.name, durationMinutes, priceCents, category: f.category });
      showToast(t("modules.xaphiresBeauty.servicos.salvo"));
      cancelar();
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function remover(s) {
    if (!window.confirm(t("modules.xaphiresBeauty.servicos.confirmarRemover", { nome: s.name }))) return;
    try {
      await api.xbDeleteService(s.id);
      showToast(t("modules.xaphiresBeauty.servicos.removido"));
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  function abrirUploadFoto(servicoId) {
    alvoUploadRef.current = servicoId;
    fileInputRef.current?.click();
  }
  async function enviarFoto(e) {
    const file = e.target.files?.[0];
    const servicoId = alvoUploadRef.current;
    e.target.value = "";
    if (!file || !servicoId) return;
    setEnviandoFotoId(servicoId);
    try {
      const atualizado = await api.xbUploadServicePhoto(servicoId, file);
      setServicos((ss) => ss.map((s) => (s.id === atualizado.id ? atualizado : s)));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setEnviandoFotoId(null);
    }
  }

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const s of servicos) {
      const chave = (s.category || "").trim() || t("modules.xaphiresBeauty.servicos.semCategoria");
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(s);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [servicos, t]);

  return (
    <div>
      <div className="beauty-page-head">
        <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.servicos")}</h2>
      </div>

      <div className="beauty-card" style={{ marginBottom: 18 }}>
        <form className="beauty-form" onSubmit={salvar}>
          <input type="text" placeholder={t("modules.xaphiresBeauty.servicos.nome")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
          <input
            type="text"
            placeholder={t("modules.xaphiresBeauty.servicos.categoria")}
            value={f.category}
            onChange={(e) => setF({ ...f, category: e.target.value })}
            style={{ maxWidth: 160 }}
          />
          <input
            type="number"
            min="1"
            placeholder={t("modules.xaphiresBeauty.servicos.duracao")}
            value={f.durationMinutes}
            onChange={(e) => setF({ ...f, durationMinutes: e.target.value })}
            style={{ maxWidth: 130 }}
          />
          <input
            type="text"
            inputMode="decimal"
            placeholder={t("modules.xaphiresBeauty.servicos.preco")}
            value={f.price}
            onChange={(e) => setF({ ...f, price: e.target.value })}
            style={{ maxWidth: 130 }}
          />
          <button type="submit" className="btn-primary">{editandoId ? t("common.save") : t("common.add")}</button>
          {editandoId && <button type="button" className="btn-ghost" onClick={cancelar}>{t("common.cancel")}</button>}
        </form>
      </div>

      {erro && <div className="beauty-error">{erro}</div>}

      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={enviarFoto} />

      <div className="beauty-card">
        {servicos.length === 0 ? (
          <BeautyEmptyState title={t("modules.xaphiresBeauty.servicos.vazio")} />
        ) : (
          grupos.map(([categoria, itens]) => (
            <div key={categoria} style={{ marginBottom: 18 }}>
              <h3 className="beauty-section-title">{categoria}</h3>
              <div className="beauty-list">
                <div className="beauty-list-head">
                  <span style={{ flex: 1.4 }}>{t("modules.xaphiresBeauty.servicos.nome")}</span>
                  <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.servicos.duracao")}</span>
                  <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.servicos.preco")}</span>
                </div>
                {itens.map((s) => {
                  const fotoUrl = s.avatar_path ? `/api/xaphires-beauty/services/${s.id}/photo?v=${s.avatar_path}` : null;
                  return (
                    <div className="beauty-list-row" key={s.id}>
                      <span className="beauty-cell-primary" style={{ flex: 1.4, display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar id={s.id} name={s.name} avatarUrl={fotoUrl} />
                        {s.name}
                      </span>
                      <span className="beauty-cell-muted" style={{ flex: 1 }}>{t("modules.xaphiresBeauty.servicos.minutos", { count: s.duration_minutes })}</span>
                      <span className="beauty-cell-muted" style={{ flex: 1 }}>{formatarValor(s.price_cents, i18n.language)}</span>
                      <span className="beauty-col-actions">
                        <button type="button" className="btn-ghost" onClick={() => abrirUploadFoto(s.id)} disabled={enviandoFotoId === s.id}>
                          {t("modules.xaphiresBeauty.servicos.editarFoto")}
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => editar(s)}>{t("financeiro.cad.editar")}</button>
                        <button type="button" className="btn-ghost" onClick={() => remover(s)}>{t("common.remove")}</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {ranking.length > 0 && (
        <div className="beauty-card" style={{ marginTop: 18 }}>
          <h3 className="beauty-section-title">{t("modules.xaphiresBeauty.servicos.ranking")}</h3>
          <div className="beauty-list">
            {ranking.map((r) => (
              <div className="beauty-list-row" key={r.service_id}>
                <span className="beauty-cell-primary" style={{ flex: 1.4 }}>{r.name}</span>
                <span className="beauty-cell-muted" style={{ flex: 1.6 }}>
                  {t("modules.xaphiresBeauty.servicos.rankingResumo", { visitas: r.visits, total: formatarValor(r.total_cents, i18n.language) })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
