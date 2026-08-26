import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyEmptyState from "./BeautyEmptyState.jsx";
import BeautyIcon from "./BeautyIcon.jsx";

const VAZIO = { name: "", role: "", commissionPct: "0" };

// Registro interno do profissional - sem conta de login própria (decisão
// confirmada com o cliente). commission_rate no banco é fração (0.2 = 20%);
// aqui no formulário é percentual inteiro, mais natural para digitar.
export default function BeautyStaffView({ canUse }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [equipe, setEquipe] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);

  async function carregar() {
    if (!canUse) return;
    try {
      setEquipe(await api.xbGetStaff());
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, [canUse]);

  function editar(s) {
    setEditandoId(s.id);
    setF({ name: s.name, role: s.role || "", commissionPct: String(Math.round(s.commission_rate * 100)) });
  }
  function cancelar() {
    setEditandoId(null);
    setF(VAZIO);
  }

  async function salvar(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    const commissionRate = Math.min(1, Math.max(0, (Number(f.commissionPct) || 0) / 100));
    try {
      if (editandoId) await api.xbUpdateStaff(editandoId, { name: f.name, role: f.role, commissionRate });
      else await api.xbCreateStaff({ name: f.name, role: f.role, commissionRate });
      showToast(t("modules.xaphiresBeauty.equipe.salvo"));
      cancelar();
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function remover(s) {
    if (!window.confirm(t("modules.xaphiresBeauty.equipe.confirmarRemover", { nome: s.name }))) return;
    try {
      await api.xbDeleteStaff(s.id);
      showToast(t("modules.xaphiresBeauty.equipe.removido"));
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  if (!canUse) {
    return (
      <div>
        <div className="beauty-page-head">
          <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.equipe")}</h2>
        </div>
        <div className="beauty-card">
          <div className="beauty-lock-card">
            <BeautyIcon name="equipe" size={30} />
            <span>{t("modules.xaphiresBeauty.equipe.bloqueado", { plano: t("plan.names.intermediate") })}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="beauty-page-head">
        <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.equipe")}</h2>
      </div>

      <div className="beauty-card" style={{ marginBottom: 18 }}>
        <form className="beauty-form" onSubmit={salvar}>
          <input type="text" placeholder={t("modules.xaphiresBeauty.equipe.nome")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
          <input type="text" placeholder={t("modules.xaphiresBeauty.equipe.cargo")} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
          <input
            type="number"
            min="0"
            max="100"
            placeholder={t("modules.xaphiresBeauty.equipe.comissao")}
            value={f.commissionPct}
            onChange={(e) => setF({ ...f, commissionPct: e.target.value })}
            style={{ maxWidth: 130 }}
          />
          <button type="submit" className="btn-primary">{editandoId ? t("common.save") : t("common.add")}</button>
          {editandoId && <button type="button" className="btn-ghost" onClick={cancelar}>{t("common.cancel")}</button>}
        </form>
      </div>

      {erro && <div className="beauty-error">{erro}</div>}

      <div className="beauty-card">
        {equipe.length === 0 ? (
          <BeautyEmptyState title={t("modules.xaphiresBeauty.equipe.vazio")} />
        ) : (
          <div className="beauty-list">
            <div className="beauty-list-head">
              <span style={{ flex: 1.4 }}>{t("modules.xaphiresBeauty.equipe.nome")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.equipe.cargo")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.equipe.comissao")}</span>
            </div>
            {equipe.map((s) => (
              <div className="beauty-list-row" key={s.id}>
                <span className="beauty-cell-primary" style={{ flex: 1.4 }}>{s.name}</span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{s.role || "—"}</span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{Math.round(s.commission_rate * 100)}%</span>
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
