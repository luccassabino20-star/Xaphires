import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";

const VAZIO = { name: "", role: "", commissionPct: "0" };

// Registro interno do profissional - sem conta de login própria (decisão
// confirmada com o cliente). commission_rate no banco é fração (0.2 = 20%);
// aqui no formulário é percentual inteiro, mais natural para digitar.
export default function BeautyStaffView() {
  const { t } = useTranslation();
  const showToast = useToast();
  const [equipe, setEquipe] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);

  async function carregar() {
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
  }, []);

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

  return (
    <div className="sc-cad-secao">
      <form className="sc-form" onSubmit={salvar}>
        <input type="text" placeholder={t("modules.xaphiresBeauty.equipe.nome")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input type="text" placeholder={t("modules.xaphiresBeauty.equipe.cargo")} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
        <input
          type="number"
          min="0"
          max="100"
          placeholder={t("modules.xaphiresBeauty.equipe.comissao")}
          value={f.commissionPct}
          onChange={(e) => setF({ ...f, commissionPct: e.target.value })}
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
              <th>{t("modules.xaphiresBeauty.equipe.nome")}</th>
              <th>{t("modules.xaphiresBeauty.equipe.cargo")}</th>
              <th>{t("modules.xaphiresBeauty.equipe.comissao")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {equipe.length === 0 ? (
              <tr>
                <td colSpan={4} className="sc-empty">{t("modules.xaphiresBeauty.equipe.vazio")}</td>
              </tr>
            ) : (
              equipe.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.role || "-"}</td>
                  <td>{Math.round(s.commission_rate * 100)}%</td>
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
