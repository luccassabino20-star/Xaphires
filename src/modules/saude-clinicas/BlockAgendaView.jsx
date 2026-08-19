import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { hojeCivil, segundaDaSemana, diasDaSemana, minutosParaHora, paraMinutos } from "./agendaUtils.js";

function novoVazio() {
  return { professionalUserId: "", date: hojeCivil(), time: "08:00", durationMin: 60, reason: "" };
}

// Bloqueio de Agenda: cadastro de folga/almoço/feriado, separado da Agenda em
// si (que só lê e desenha - ver AgendaView.itensDoDia). A janela listada é
// sempre a semana corrente pra frente por padrão porque bloqueio é sempre
// sobre o futuro (bloquear o passado não muda nada que já aconteceu); dá pra
// abrir outro período pelos mesmos campos de data do formulário de busca.
export default function BlockAgendaView() {
  const { t } = useTranslation();
  const showToast = useToast();
  const [professionals, setProfessionals] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(novoVazio());
  const [periodo, setPeriodo] = useState(() => {
    const seg = segundaDaSemana(hojeCivil());
    return { from: seg, to: diasDaSemana(seg)[6] };
  });

  async function carregar() {
    try {
      setBlocks(await api.scListBlocks(periodo.from, periodo.to));
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, [periodo.from, periodo.to]);
  useEffect(() => {
    api.listUsers().then(setProfessionals).catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, []);

  async function criar(e) {
    e.preventDefault();
    try {
      await api.scCreateBlock({ ...f, professionalUserId: f.professionalUserId || null, durationMin: Number(f.durationMin) || 30 });
      showToast(t("saudeClinicas.agenda.bloqueioCriado"));
      setF(novoVazio());
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function excluir(id) {
    try {
      await api.scDeleteBlock(id);
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  function nomeProfissional(id) {
    if (!id) return t("saudeClinicas.agenda.agendaInteira");
    return professionals.find((p) => p.id === id)?.name || "-";
  }

  return (
    <div className="sc-cad-secao">
      <h2 className="sc-config-title">{t("saudeClinicas.sidebar.bloqueioAgenda")}</h2>
      <p className="sc-hint">{t("saudeClinicas.agenda.bloqueioHint")}</p>

      <form className="sc-form" onSubmit={criar}>
        <select value={f.professionalUserId} onChange={(e) => setF({ ...f, professionalUserId: e.target.value })}>
          <option value="">{t("saudeClinicas.agenda.agendaInteira")}</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <input type="time" step={900} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        <input type="number" min={15} step={15} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} title={t("saudeClinicas.agenda.duracaoMin")} />
        <input type="text" placeholder={t("saudeClinicas.agenda.motivoBloqueio")} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <button type="submit" className="btn-primary btn-small">{t("saudeClinicas.agenda.criarBloqueio")}</button>
      </form>

      {erro && <div className="sc-error">{erro}</div>}

      <div className="sc-agenda-linha">
        <label className="sc-hint">{t("saudeClinicas.agenda.periodoLista")}</label>
        <input type="date" value={periodo.from} onChange={(e) => setPeriodo((p) => ({ ...p, from: e.target.value }))} />
        <span className="sc-hint">–</span>
        <input type="date" value={periodo.to} onChange={(e) => setPeriodo((p) => ({ ...p, to: e.target.value }))} />
      </div>

      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("saudeClinicas.agenda.colData")}</th>
              <th>{t("saudeClinicas.agenda.colHora")}</th>
              <th>{t("saudeClinicas.agenda.profissional")}</th>
              <th>{t("saudeClinicas.agenda.motivoBloqueio")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {blocks.length === 0 ? (
              <tr>
                <td colSpan={5} className="sc-empty">{t("saudeClinicas.agenda.bloqueiosVazio")}</td>
              </tr>
            ) : (
              blocks.map((b) => (
                <tr key={b.id}>
                  <td>{b.date}</td>
                  <td>{b.time} – {minutosParaHora(paraMinutos(b.time) + b.duration_min)}</td>
                  <td>{nomeProfissional(b.professional_user_id)}</td>
                  <td>{b.reason || "-"}</td>
                  <td className="sc-row-actions">
                    <button type="button" className="btn-ghost btn-small" onClick={() => excluir(b.id)}>{t("common.delete")}</button>
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
