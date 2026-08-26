import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyEmptyState from "./BeautyEmptyState.jsx";

const VAZIO = { name: "", phone: "", doc: "", notes: "" };

// Cadastro de clientes: cartão de formulário + lista em linhas limpas. doc é
// opcional (CPF/CNPJ), mas quando preenchido o servidor valida o dígito
// verificador (server/doc.js).
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
    <div>
      <div className="beauty-page-head">
        <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.clientes")}</h2>
      </div>

      <div className="beauty-card" style={{ marginBottom: 18 }}>
        <form className="beauty-form" onSubmit={salvar}>
          <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.nome")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.telefone")} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.doc")} value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })} />
          <input type="text" placeholder={t("modules.xaphiresBeauty.clientes.notas")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <button type="submit" className="btn-primary">{editandoId ? t("common.save") : t("common.add")}</button>
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
            {clientes.map((c) => (
              <div className="beauty-list-row" key={c.id}>
                <span className="beauty-cell-primary" style={{ flex: 1.4 }}>{c.name}</span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{c.phone || "—"}</span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{c.doc || "—"}</span>
                <span className="beauty-col-actions">
                  <button type="button" className="btn-ghost" onClick={() => editar(c)}>{t("financeiro.cad.editar")}</button>
                  <button type="button" className="btn-ghost" onClick={() => remover(c)}>{t("common.remove")}</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
