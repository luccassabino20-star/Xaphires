import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import {
  PASSO_MIN, TOTAL_SLOTS,
  hojeCivil, segundaDaSemana, diasDaSemana, adicionarDias, slotDoHorario,
} from "./agendaUtils.js";

function rotuloDia(dataCivil, t) {
  const d = new Date(dataCivil + "T00:00:00");
  return { semana: t(`saudeClinicas.agenda.diaSemana.${d.getDay()}`), numero: d.getDate() };
}

// Ocupação da semana derivada dos agendamentos/bloqueios que já existem - sem
// cadastro de horário de trabalho por profissional (isso ficou como possível
// evolução futura, ver [[plataforma-modulos]] no histórico do projeto). Cada
// célula é uma faixa de TOTAL_SLOTS quadradinhos (mesma grade de 15min da
// Agenda), só que deitada, pra caber profissional × dia numa tabela só.
export default function AvailabilityMatrixView() {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState(hojeCivil());
  const [professionals, setProfessionals] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [erro, setErro] = useState("");

  const dias = useMemo(() => diasDaSemana(segundaDaSemana(anchor)), [anchor]);
  const from = dias[0];
  const to = dias[dias.length - 1];

  useEffect(() => {
    api.listUsers().then(setProfessionals).catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    Promise.all([api.scListAppointments(from, to), api.scListBlocks(from, to)])
      .then(([ap, bl]) => {
        setAppointments(ap);
        setBlocks(bl);
        setErro("");
      })
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, [from, to]);

  // slots ocupados (array de booleans, um por slot de 15min) de um
  // profissional num dia - bloqueio sem profissional (agenda inteira) conta
  // pra todo mundo.
  function slotsOcupados(profId, dia) {
    const ocupados = new Array(TOTAL_SLOTS).fill(false);
    function marcar(time, durationMin) {
      const inicio = slotDoHorario(time);
      const fim = inicio + Math.ceil(durationMin / PASSO_MIN);
      for (let i = Math.max(0, inicio); i < Math.min(TOTAL_SLOTS, fim); i++) ocupados[i] = true;
    }
    appointments
      .filter((a) => a.date === dia && a.professional_user_id === profId && a.status !== "cancelado")
      .forEach((a) => marcar(a.time, a.duration_min));
    blocks
      .filter((b) => b.date === dia && (b.professional_user_id === profId || !b.professional_user_id))
      .forEach((b) => marcar(b.time, b.duration_min));
    return ocupados;
  }

  return (
    <div className="sc-agenda">
      <div className="sc-agenda-toolbar">
        <div className="sc-agenda-toolbar-esquerda">
          <button type="button" className="btn-ghost btn-small" onClick={() => setAnchor(adicionarDias(anchor, -7))}>‹</button>
          <button type="button" className="btn-ghost btn-small" onClick={() => setAnchor(hojeCivil())}>{t("saudeClinicas.agenda.hoje")}</button>
          <button type="button" className="btn-ghost btn-small" onClick={() => setAnchor(adicionarDias(anchor, 7))}>›</button>
          <span className="sc-agenda-periodo-label">{from} – {to}</span>
        </div>
        <div className="sc-matrix-legenda">
          <span className="sc-matrix-legenda-item"><i className="sc-matrix-dot sc-matrix-dot-ocupado" />{t("saudeClinicas.agenda.ocupado")}</span>
          <span className="sc-matrix-legenda-item"><i className="sc-matrix-dot sc-matrix-dot-livre" />{t("saudeClinicas.agenda.livre")}</span>
        </div>
      </div>

      {erro && <div className="sc-error">{erro}</div>}
      {professionals.length === 0 && !erro && <p className="sc-empty">{t("saudeClinicas.agenda.semProfissionais")}</p>}

      <div className="sc-matrix-wrap">
        <table className="sc-matrix-table">
          <thead>
            <tr>
              <th className="sc-matrix-col-prof">{t("saudeClinicas.agenda.profissional")}</th>
              {dias.map((d) => {
                const { semana, numero } = rotuloDia(d, t);
                return <th key={d}>{semana} {numero}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {professionals.map((p) => (
              <tr key={p.id}>
                <td className="sc-matrix-col-prof">{p.name}</td>
                {dias.map((d) => {
                  const ocupados = slotsOcupados(p.id, d);
                  return (
                    <td key={d}>
                      <div className="sc-matrix-strip" title={`${ocupados.filter(Boolean).length * PASSO_MIN} min`}>
                        {ocupados.map((ocupado, i) => (
                          <span key={i} className={"sc-matrix-slot" + (ocupado ? " sc-matrix-slot-ocupado" : "")} />
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sc-hint">{t("saudeClinicas.agenda.matrizHint")}</p>
    </div>
  );
}
