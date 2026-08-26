import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";

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
    <div className="sc-cad-secao">
      <form className="sc-form" onSubmit={salvar}>
        <input type="text" placeholder={t("modules.xaphiresBeauty.servicos.nome")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input
          type="number"
          min="1"
          placeholder={t("modules.xaphiresBeauty.servicos.duracao")}
          value={f.durationMinutes}
          onChange={(e) => setF({ ...f, durationMinutes: e.target.value })}
          style={{ maxWidth: 110 }}
        />
        <input
          type="text"
          inputMode="decimal"
          placeholder={t("modules.xaphiresBeauty.servicos.preco")}
          value={f.price}
          onChange={(e) => setF({ ...f, price: e.target.value })}
          style={{ maxWidth: 110 }}
        />
        <button type="submit" className="btn-primary btn-small">{editandoId ? t("common.save") : t("common.add")}</button>
        {editandoId && <button type="button" className="btn-ghost btn-small" onClick={cancelar}>{t("common.cancel")}</button>}
      </form>

      {erro && <div className="sc-error">{erro}</div>}

      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("modules.xaphiresBeauty.servicos.nome")}</th>
              <th>{t("modules.xaphiresBeauty.servicos.duracao")}</th>
              <th>{t("modules.xaphiresBeauty.servicos.preco")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {servicos.length === 0 ? (
              <tr>
                <td colSpan={4} className="sc-empty">{t("modules.xaphiresBeauty.servicos.vazio")}</td>
              </tr>
            ) : (
              servicos.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{t("modules.xaphiresBeauty.servicos.minutos", { count: s.duration_minutes })}</td>
                  <td>{formatarValor(s.price_cents, i18n.language)}</td>
                  <td className="sc-row-actions">
                    <button type="button" className="btn-ghost btn-small" onClick={() => editar(s)}>{t("financeiro.cad.editar")}</button>
                    <button type="button" className="btn-ghost btn-small" onClick={() => remover(s)}>{t("common.remove")}</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
