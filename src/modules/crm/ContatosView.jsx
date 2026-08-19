import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";

const VAZIO = { name: "", phone: "", email: "", companyName: "", notes: "" };

// Cadastro de contatos: mesmo molde de PatientsView (Saúde & Clínicas) e das
// seções de CadastrosView (Financeiro) - formulário no topo, tabela embaixo,
// edição inline.
export default function ContatosView() {
  const { t } = useTranslation();
  const showToast = useToast();
  const [contatos, setContatos] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);

  async function carregar() {
    try {
      setContatos(await api.crmListContacts());
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  function editar(c) {
    setEditandoId(c.id);
    setF({ name: c.name, phone: c.phone || "", email: c.email || "", companyName: c.company_name || "", notes: c.notes || "" });
  }
  function cancelar() {
    setEditandoId(null);
    setF(VAZIO);
  }

  async function salvar(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    try {
      if (editandoId) await api.crmUpdateContact(editandoId, f);
      else await api.crmCreateContact(f);
      showToast(t("crm.contatos.salvo"));
      cancelar();
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  return (
    <div className="sc-cad-secao">
      <form className="sc-form" onSubmit={salvar}>
        <input type="text" placeholder={t("crm.contatos.nome")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input type="text" placeholder={t("crm.contatos.telefone")} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <input type="text" placeholder={t("crm.contatos.email")} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input type="text" placeholder={t("crm.contatos.empresa")} value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} />
        <input type="text" placeholder={t("crm.contatos.notas")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <button type="submit" className="btn-primary btn-small">{editandoId ? t("common.save") : t("common.add")}</button>
        {editandoId && <button type="button" className="btn-ghost btn-small" onClick={cancelar}>{t("common.cancel")}</button>}
      </form>

      {erro && <div className="sc-error">{erro}</div>}

      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("crm.contatos.nome")}</th>
              <th>{t("crm.contatos.telefone")}</th>
              <th>{t("crm.contatos.empresa")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contatos.length === 0 ? (
              <tr>
                <td colSpan={4} className="sc-empty">{t("crm.contatos.vazio")}</td>
              </tr>
            ) : (
              contatos.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone || "-"}</td>
                  <td>{c.company_name || "-"}</td>
                  <td className="sc-row-actions">
                    <button type="button" className="btn-ghost btn-small" onClick={() => editar(c)}>{t("financeiro.cad.editar")}</button>
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
