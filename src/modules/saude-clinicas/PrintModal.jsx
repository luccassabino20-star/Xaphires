import { useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { hojeCivil, segundaDaSemana, diasDaSemana } from "./agendaUtils.js";

// Modal de impressão: escolhe o período, busca os dados na hora (não reusa o
// que já está carregado na grade - a pessoa pode querer imprimir uma semana
// diferente da que está olhando) e mostra uma prévia antes de mandar para a
// impressora. #sc-print-area é o único elemento visível durante a impressão
// (ver a regra @media print em index.css) - esconde a casca do modal e
// aproveita a folha inteira, independente de onde o modal está posicionado
// na tela.
export default function PrintModal({ onClose }) {
  const { t } = useTranslation();
  const [periodo, setPeriodo] = useState("dia"); // 'dia' | 'semana'
  const [incluirBloqueios, setIncluirBloqueios] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [dados, setDados] = useState(null); // { from, to, appointments, blocks }

  async function gerarPreview(e) {
    e.preventDefault();
    setCarregando(true);
    setErro("");
    try {
      const hoje = hojeCivil();
      const from = periodo === "semana" ? segundaDaSemana(hoje) : hoje;
      const to = periodo === "semana" ? diasDaSemana(from)[6] : hoje;
      const [appointments, blocks] = await Promise.all([
        api.scListAppointments(from, to),
        incluirBloqueios ? api.scListBlocks(from, to) : Promise.resolve([]),
      ]);
      setDados({ from, to, appointments, blocks });
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sc-print-modal">
        <button className="modal-close sc-no-print" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        {!dados ? (
          <form className="sc-form sc-form-column sc-no-print" onSubmit={gerarPreview}>
            <h3 className="sc-config-title">{t("saudeClinicas.agenda.imprimir")}</h3>
            {erro && <div className="sc-error">{erro}</div>}
            <label className="sc-checkbox">
              <input type="radio" name="periodo" checked={periodo === "dia"} onChange={() => setPeriodo("dia")} />
              {t("saudeClinicas.agenda.imprimirDia")}
            </label>
            <label className="sc-checkbox">
              <input type="radio" name="periodo" checked={periodo === "semana"} onChange={() => setPeriodo("semana")} />
              {t("saudeClinicas.agenda.imprimirSemana")}
            </label>
            <label className="sc-checkbox">
              <input type="checkbox" checked={incluirBloqueios} onChange={(e) => setIncluirBloqueios(e.target.checked)} />
              {t("saudeClinicas.agenda.incluirBloqueios")}
            </label>
            <button type="submit" className="btn-primary" disabled={carregando}>
              {carregando ? t("common.loading") : t("saudeClinicas.agenda.gerarPrevia")}
            </button>
          </form>
        ) : (
          <div>
            <div className="sc-print-preview-acoes sc-no-print">
              <button type="button" className="btn-ghost btn-small" onClick={() => setDados(null)}>{t("saudeClinicas.agenda.voltarOpcoes")}</button>
              <button type="button" className="btn-primary btn-small" onClick={() => window.print()}>{t("saudeClinicas.agenda.imprimir")}</button>
            </div>
            <div id="sc-print-area">
              <h2>{t("saudeClinicas.agenda.tituloImpressao", { from: dados.from, to: dados.to })}</h2>
              <table className="sc-print-table">
                <thead>
                  <tr>
                    <th>{t("saudeClinicas.agenda.colData")}</th>
                    <th>{t("saudeClinicas.agenda.colHora")}</th>
                    <th>{t("saudeClinicas.pacientes.nome")}</th>
                    <th>{t("saudeClinicas.agenda.colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.appointments.map((a) => (
                    <tr key={a.id}>
                      <td>{a.date}</td>
                      <td>{a.time}</td>
                      <td>{a.patient_name}</td>
                      <td>{t(`saudeClinicas.agenda.status.${a.status}`)}</td>
                    </tr>
                  ))}
                  {dados.blocks.map((b) => (
                    <tr key={b.id} className="sc-print-bloqueio">
                      <td>{b.date}</td>
                      <td>{b.time}</td>
                      <td colSpan={2}>{t("saudeClinicas.agenda.abaBloqueio")}: {b.reason || "-"}</td>
                    </tr>
                  ))}
                  {dados.appointments.length === 0 && dados.blocks.length === 0 && (
                    <tr>
                      <td colSpan={4}>{t("saudeClinicas.agenda.semItensPeriodo")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
