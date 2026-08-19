import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";

const VAZIO = { name: "", birthDate: "", gender: "", phone: "", cpf: "", email: "", notes: "" };

// Cadastro de pacientes: formulário + tabela, mesmo molde das seções de
// CadastrosView.jsx do Financeiro (form no topo, edição inline carregando o
// mesmo formulário, ativar/desativar em vez de excluir de verdade).
export default function PatientsView() {
  const { t } = useTranslation();
  const showToast = useToast();
  const [patients, setPatients] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);

  async function carregar() {
    try {
      setPatients(await api.scListPatients());
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  function editar(p) {
    setEditandoId(p.id);
    setF({
      name: p.name,
      birthDate: p.birth_date || "",
      gender: p.gender || "",
      phone: p.phone || "",
      cpf: p.cpf || "",
      email: p.email || "",
      notes: p.notes || "",
    });
  }
  function cancelar() {
    setEditandoId(null);
    setF(VAZIO);
  }

  async function salvar(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    try {
      if (editandoId) await api.scUpdatePatient(editandoId, f);
      else await api.scCreatePatient(f);
      showToast(t("saudeClinicas.pacientes.salvo"));
      cancelar();
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function alternarAtivo(p) {
    try {
      await api.scUpdatePatient(p.id, { active: !p.active });
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  return (
    <div className="sc-cad-secao">
      <form className="sc-form" onSubmit={salvar}>
        <input type="text" placeholder={t("saudeClinicas.pacientes.nome")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input type="date" title={t("saudeClinicas.pacientes.nascimento")} value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} />
        <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
          <option value="">{t("saudeClinicas.pacientes.generoEscolha")}</option>
          <option value="feminino">{t("saudeClinicas.pacientes.genero.feminino")}</option>
          <option value="masculino">{t("saudeClinicas.pacientes.genero.masculino")}</option>
          <option value="outro">{t("saudeClinicas.pacientes.genero.outro")}</option>
        </select>
        <input type="text" placeholder={t("saudeClinicas.pacientes.telefone")} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <input type="text" placeholder={t("saudeClinicas.pacientes.cpf")} value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} />
        <input type="text" placeholder={t("saudeClinicas.pacientes.email")} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input type="text" placeholder={t("saudeClinicas.pacientes.notas")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <button type="submit" className="btn-primary btn-small">{editandoId ? t("common.save") : t("common.add")}</button>
        {editandoId && <button type="button" className="btn-ghost btn-small" onClick={cancelar}>{t("common.cancel")}</button>}
      </form>

      {erro && <div className="sc-error">{erro}</div>}

      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("saudeClinicas.pacientes.nome")}</th>
              <th>{t("saudeClinicas.pacientes.telefone")}</th>
              <th>{t("saudeClinicas.pacientes.nascimento")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 ? (
              <tr>
                <td colSpan={4} className="sc-empty">{t("saudeClinicas.pacientes.vazio")}</td>
              </tr>
            ) : (
              patients.map((p) => (
                <tr key={p.id} className={!p.active ? "sc-row-inativo" : ""}>
                  <td>{p.name}</td>
                  <td>{p.phone || "-"}</td>
                  <td>{p.birth_date || "-"}</td>
                  <td className="sc-row-actions">
                    <button type="button" className="btn-ghost btn-small" onClick={() => editar(p)}>{t("financeiro.cad.editar")}</button>
                    <button type="button" className="btn-ghost btn-small" onClick={() => alternarAtivo(p)}>
                      {p.active ? t("financeiro.cad.desativar") : t("financeiro.cad.ativar")}
                    </button>
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
