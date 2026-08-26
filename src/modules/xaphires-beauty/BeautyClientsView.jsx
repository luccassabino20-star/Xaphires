import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";

const VAZIO = { name: "", phone: "", doc: "", notes: "" };

// Cadastro de clientes: mesmo molde de ContatosView.jsx (CRM) - formulário
// no topo, tabela embaixo, edição inline. doc é opcional (CPF/CNPJ), mas
// quando preenchido o servidor valida o dígito verificador (server/doc.js).
export default function BeautyClientsView() {
  const { t } = useTranslation();
  const showToast = useToast();
  const [clientes, setClientes] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);

  async function carregar() {
    try {
      setClientes(await api.xbGetClients());
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
    setF({ name: c.name, phone: c.phone || "", doc: c.doc || "", notes: c.notes || "" });
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

  return (
    <div className="sc-cad-secao">
      <form className="sc-form" onSubmit={salvar}>
        <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.nome")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.telefone")} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.doc")} value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })} />
        <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.notas")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <button type="submit" className="btn-primary btn-small">{editandoId ? t("common.save") : t("common.add")}</button>
        {editandoId && <button type="button" className="btn-ghost btn-small" onClick={cancelar}>{t("common.cancel")}</button>}
      </form>

      {erro && <div className="sc-error">{erro}</div>}

      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("modules.xaphiresBeauty.clientes.nome")}</th>
              <th>{t("modules.xaphiresBeauty.clientes.telefone")}</th>
              <th>{t("modules.xaphiresBeauty.clientes.doc")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clientes.length === 0 ? (
              <tr>
                <td colSpan={4} className="sc-empty">{t("modules.xaphiresBeauty.clientes.vazio")}</td>
              </tr>
            ) : (
              clientes.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone || "-"}</td>
                  <td>{c.doc || "-"}</td>
                  <td className="sc-row-actions">
                    <button type="button" className="btn-ghost btn-small" onClick={() => editar(c)}>{t("financeiro.cad.editar")}</button>
                    <button type="button" className="btn-ghost btn-small" onClick={() => remover(c)}>{t("common.remove")}</button>
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
