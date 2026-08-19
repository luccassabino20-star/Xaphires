import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import PatientDetailModal from "./PatientDetailModal.jsx";

// Listagem de pacientes: a edição rica (abas, foto, endereço, preferências)
// mora inteira em PatientDetailModal - esta tela só lista, busca, ativa/
// desativa e abre o modal pra criar ou editar. Não existe mais um formulário
// simples paralelo aqui: tinha campos de menos e duas telas de cadastro
// divergentes convidava a esquecer de manter uma delas atualizada.
export default function PatientsView() {
  const { t } = useTranslation();
  const [patients, setPatients] = useState([]);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [modalId, setModalId] = useState(undefined); // undefined = fechado, null = novo, id = editar

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

  async function alternarAtivo(p) {
    try {
      await api.scUpdatePatient(p.id, { active: !p.active });
      await carregar();
    } catch (err) {
      setErro(translateError(err, t));
    }
  }

  const filtrados = patients.filter((p) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.phone || "").includes(q) || (p.cpf || "").includes(q);
  });

  return (
    <div className="sc-cad-secao">
      <div className="sc-form">
        <input type="text" placeholder={t("saudeClinicas.pacientes.buscar")} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button type="button" className="btn-primary btn-small" onClick={() => setModalId(null)}>
          {t("saudeClinicas.pacientes.novoPaciente")}
        </button>
      </div>

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
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={4} className="sc-empty">{t("saudeClinicas.pacientes.vazio")}</td>
              </tr>
            ) : (
              filtrados.map((p) => (
                <tr key={p.id} className={!p.active ? "sc-row-inativo" : ""}>
                  <td>
                    {p.name}
                    {p.critical_alert === 1 && <span className="sc-patient-badge-alerta sc-patient-badge-alerta-mini" title={t("saudeClinicas.pacientes.alertaCritico")}>!</span>}
                  </td>
                  <td>{p.phone || "-"}</td>
                  <td>{p.birth_date || "-"}</td>
                  <td className="sc-row-actions">
                    <button type="button" className="btn-ghost btn-small" onClick={() => setModalId(p.id)}>{t("financeiro.cad.editar")}</button>
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

      {modalId !== undefined && (
        <PatientDetailModal
          patientId={modalId}
          onClose={() => setModalId(undefined)}
          onSaved={carregar}
        />
      )}
    </div>
  );
}
