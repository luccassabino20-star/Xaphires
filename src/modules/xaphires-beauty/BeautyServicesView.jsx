import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyEmptyState from "./BeautyEmptyState.jsx";

const VAZIO = { name: "", durationMinutes: "30", price: "" };

function formatarValor(cents, locale) {
  if (cents === null || cents === undefined) return "-";
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(cents / 100);
}

// Catálogo de serviços: duração em minutos e preço em reais no formulário
// (convertido para centavos inteiros ao salvar - dinheiro nunca em float,
// mesma regra de plans.js/PlanModal.jsx).
export default function BeautyServicesView() {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [servicos, setServicos] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);

  async function carregar() {
    try {
      setServicos(await api.xbGetServices());
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
    setF({ name: s.name, durationMinutes: String(s.duration_minutes), price: String(s.price_cents / 100) });
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
      if (editandoId) await api.xbUpdateService(editandoId, { name: f.name, durationMinutes, priceCents });
      else await api.xbCreateService({ name: f.name, durationMinutes, priceCents });
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

  return (
    <div>
      <div className="beauty-page-head">
        <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.servicos")}</h2>
      </div>

      <div className="beauty-card" style={{ marginBottom: 18 }}>
        <form className="beauty-form" onSubmit={salvar}>
          <input type="text" placeholder={t("modules.xaphiresBeauty.servicos.nome")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
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

      <div className="beauty-card">
        {servicos.length === 0 ? (
          <BeautyEmptyState title={t("modules.xaphiresBeauty.servicos.vazio")} />
        ) : (
          <div className="beauty-list">
            <div className="beauty-list-head">
              <span style={{ flex: 1.4 }}>{t("modules.xaphiresBeauty.servicos.nome")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.servicos.duracao")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.servicos.preco")}</span>
            </div>
            {servicos.map((s) => (
              <div className="beauty-list-row" key={s.id}>
                <span className="beauty-cell-primary" style={{ flex: 1.4 }}>{s.name}</span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{t("modules.xaphiresBeauty.servicos.minutos", { count: s.duration_minutes })}</span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{formatarValor(s.price_cents, i18n.language)}</span>
                <span className="beauty-col-actions">
                  <button type="button" className="btn-ghost" onClick={() => editar(s)}>{t("financeiro.cad.editar")}</button>
                  <button type="button" className="btn-ghost" onClick={() => remover(s)}>{t("common.remove")}</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
