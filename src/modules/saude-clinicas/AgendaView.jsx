import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import {
  HORA_INICIO, HORA_FIM, PASSO_MIN, TOTAL_SLOTS,
  hojeCivil, segundaDaSemana, diasDaSemana, adicionarDias,
  paraMinutos, minutosParaHora, slotDoHorario, calcularRaias,
} from "./agendaUtils.js";
import AppointmentModal from "./AppointmentModal.jsx";
import AppointmentDetailModal from "./AppointmentDetailModal.jsx";
import WaitlistModal from "./WaitlistModal.jsx";
import PrintModal from "./PrintModal.jsx";

const SLOT_ALTURA = 22; // px por slot de 15min

function rotuloDia(dataCivil, t) {
  const d = new Date(dataCivil + "T00:00:00");
  const semana = t(`saudeClinicas.agenda.diaSemana.${d.getDay()}`);
  const data = `${d.getDate()}/${t(`saudeClinicas.agenda.mes.${d.getMonth()}`)}`;
  return { semana, data };
}

// Agenda semanal/diária: grade de slots de 15min à esquerda de cada dia,
// agendamentos e bloqueios posicionados por cima (position:absolute) pela
// hora de início e pela duração - mesma técnica de qualquer calendário web,
// sem biblioteca nova. Raias (agendaUtils.calcularRaias) evitam dois itens
// no mesmo horário desenharem um em cima do outro.
export default function AgendaView() {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState("semana"); // 'semana' | 'dia'
  const [anchor, setAnchor] = useState(hojeCivil());
  const [appointments, setAppointments] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [patients, setPatients] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [erro, setErro] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null); // { initialDate, initialTime } | { agendamentoExistente } | null
  const [detalhe, setDetalhe] = useState(null); // agendamento aberto no modal de detalhes, ou null
  const [waitlistAberta, setWaitlistAberta] = useState(false);
  const [printAberto, setPrintAberto] = useState(false);

  const dias = useMemo(() => (viewMode === "semana" ? diasDaSemana(segundaDaSemana(anchor)) : [anchor]), [viewMode, anchor]);
  const from = dias[0];
  const to = dias[dias.length - 1];

  async function carregarAgenda() {
    try {
      const [ap, bl] = await Promise.all([api.scListAppointments(from, to), api.scListBlocks(from, to)]);
      setAppointments(ap);
      setBlocks(bl);
      setErro("");
      return ap;
    } catch (e) {
      setErro(translateError(e, t));
      return [];
    }
  }
  useEffect(() => {
    carregarAgenda();
    // eslint-disable-next-line
  }, [from, to]);

  async function carregarApoio() {
    try {
      const [pac, proc, users, esp] = await Promise.all([
        api.scListPatients(), api.scListProcedures(), api.listUsers(), api.scListWaitlist(),
      ]);
      setPatients(pac);
      setProcedures(proc);
      setProfessionals(users);
      setWaitlistCount(esp.length);
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregarApoio();
    // eslint-disable-next-line
  }, []);

  const resultadosBusca = useMemo(() => {
    if (query.trim().length < 3) return [];
    const q = query.trim().toLowerCase();
    return patients.filter((p) => p.name.toLowerCase().includes(q) || (p.phone || "").includes(q)).slice(0, 8);
  }, [query, patients]);

  // Slot horário livre mais próximo do agora, no dia âncora - usado quando o
  // agendamento é aberto pelo botão geral (não por um clique numa célula
  // específica da grade).
  function proximoHorarioLivre() {
    const agora = new Date();
    const minAgora = agora.getHours() * 60 + agora.getMinutes();
    let inicio = Math.max(HORA_INICIO, Math.ceil(minAgora / PASSO_MIN) * PASSO_MIN);
    const ocupados = [
      ...appointments.filter((a) => a.date === anchor && a.status !== "cancelado").map((a) => [paraMinutos(a.time), paraMinutos(a.time) + a.duration_min]),
      ...blocks.filter((b) => b.date === anchor).map((b) => [paraMinutos(b.time), paraMinutos(b.time) + b.duration_min]),
    ];
    while (inicio + 30 <= HORA_FIM) {
      const livre = !ocupados.some(([ini, fim]) => inicio < fim && ini < inicio + 30);
      if (livre) return minutosParaHora(inicio);
      inicio += PASSO_MIN;
    }
    return minutosParaHora(HORA_INICIO);
  }

  function abrirNovoAgendamento(dataCivil, horario) {
    setModal({ initialDate: dataCivil || anchor, initialTime: horario || proximoHorarioLivre() });
  }

  function itensDoDia(dataCivil) {
    const ags = appointments
      .filter((a) => a.date === dataCivil)
      .map((a) => ({ id: "a" + a.id, tipo: "agendamento", dado: a, inicioMin: paraMinutos(a.time), fimMin: paraMinutos(a.time) + a.duration_min }));
    const bls = blocks
      .filter((b) => b.date === dataCivil)
      .map((b) => ({ id: "b" + b.id, tipo: "bloqueio", dado: b, inicioMin: paraMinutos(b.time), fimMin: paraMinutos(b.time) + b.duration_min }));
    const todos = [...ags, ...bls];
    const raias = calcularRaias(todos);
    return todos.map((it) => ({ ...it, ...raias.get(it.id) }));
  }

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => minutosParaHora(HORA_INICIO + i * PASSO_MIN));

  return (
    <div className="sc-agenda">
      <div className="sc-agenda-toolbar">
        <div className="sc-agenda-toolbar-esquerda">
          <div className="sc-toggle-group">
            <button type="button" className={"sc-toggle-btn" + (viewMode === "dia" ? " active" : "")} onClick={() => setViewMode("dia")}>{t("saudeClinicas.agenda.dia")}</button>
            <button type="button" className={"sc-toggle-btn" + (viewMode === "semana" ? " active" : "")} onClick={() => setViewMode("semana")}>{t("saudeClinicas.agenda.semana")}</button>
          </div>
          <button type="button" className="btn-ghost btn-small" onClick={() => setAnchor(adicionarDias(anchor, viewMode === "semana" ? -7 : -1))}>‹</button>
          <button type="button" className="btn-ghost btn-small" onClick={() => setAnchor(hojeCivil())}>{t("saudeClinicas.agenda.hoje")}</button>
          <button type="button" className="btn-ghost btn-small" onClick={() => setAnchor(adicionarDias(anchor, viewMode === "semana" ? 7 : 1))}>›</button>
          <span className="sc-agenda-periodo-label">{from}{viewMode === "semana" ? ` – ${to}` : ""}</span>
        </div>

        <div className="sc-agenda-toolbar-direita">
          <div className="sc-agenda-busca">
            <input type="text" placeholder={t("saudeClinicas.agenda.buscarPaciente")} value={query} onChange={(e) => setQuery(e.target.value)} />
            {resultadosBusca.length > 0 && (
              <div className="sc-agenda-busca-resultados">
                {resultadosBusca.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setQuery(""); setModal({ initialDate: anchor, initialTime: proximoHorarioLivre(), patientId: p.id }); }}>
                    {p.name} <span className="sc-hint">{p.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="btn-ghost btn-small" onClick={() => setWaitlistAberta(true)}>
            {t("saudeClinicas.agenda.listaEspera")}{waitlistCount > 0 && <span className="sc-agenda-badge">{waitlistCount}</span>}
          </button>
          <button type="button" className="btn-ghost btn-small" onClick={() => setPrintAberto(true)}>{t("saudeClinicas.agenda.imprimir")}</button>
          <button type="button" className="btn-primary btn-small" onClick={() => abrirNovoAgendamento()}>{t("saudeClinicas.agenda.novoAgendamento")}</button>
        </div>
      </div>

      {erro && <div className="sc-error">{erro}</div>}

      <div className="sc-agenda-grid-wrap">
        <div className="sc-agenda-grid" style={{ "--sc-dias": dias.length }}>
          <div className="sc-agenda-gutter">
            <div className="sc-agenda-gutter-header" />
            {slots.map((s, i) => (
              <div key={s} className={"sc-agenda-gutter-slot" + (s.endsWith(":00") ? " sc-agenda-gutter-hora-cheia" : "")} style={{ top: i * SLOT_ALTURA }}>
                <span>{s}</span>
              </div>
            ))}
          </div>

          {dias.map((dia) => {
            const { semana, data } = rotuloDia(dia, t);
            const ehHoje = dia === hojeCivil();
            return (
              <div key={dia} className={"sc-agenda-day" + (ehHoje ? " sc-agenda-day-current" : "")}>
                <div className="sc-agenda-day-header">
                  <span className="sc-agenda-day-semana">{semana}</span>
                  <span className="sc-agenda-day-numero">{data}</span>
                </div>
                <div className="sc-agenda-day-body" style={{ height: TOTAL_SLOTS * SLOT_ALTURA }}>
                  {slots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={"sc-agenda-slot" + (s.endsWith(":00") ? " sc-agenda-slot-hora-cheia" : "")}
                      style={{ top: slotDoHorario(s) * SLOT_ALTURA, height: SLOT_ALTURA }}
                      onClick={() => abrirNovoAgendamento(dia, s)}
                      title={s}
                    />
                  ))}
                  {itensDoDia(dia).map((it) => {
                    const largura = 100 / it.totalRaias;
                    const estilo = {
                      top: (slotDoHorario(it.dado.time)) * SLOT_ALTURA,
                      height: Math.max(1, (it.fimMin - it.inicioMin) / PASSO_MIN) * SLOT_ALTURA,
                      left: `${it.raia * largura}%`,
                      width: `calc(${largura}% - 3px)`,
                    };
                    if (it.tipo === "bloqueio") {
                      return (
                        <div key={it.id} className="sc-agenda-card sc-agenda-card-bloqueio" style={estilo} title={it.dado.reason}>
                          <span>{t("saudeClinicas.agenda.bloqueado")}</span>
                          {it.dado.reason && <span className="sc-agenda-card-sub">{it.dado.reason}</span>}
                        </div>
                      );
                    }
                    const a = it.dado;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        className={"sc-agenda-card sc-agenda-card-" + a.status}
                        style={estilo}
                        onClick={() => setDetalhe(a)}
                      >
                        <span className="sc-agenda-card-top" />
                        <span className="sc-agenda-card-hora">{a.time} - {minutosParaHora(paraMinutos(a.time) + a.duration_min)}</span>
                        <span className="sc-agenda-card-nome">{a.patient_name}</span>
                        <span className="sc-agenda-card-status-label">{t(`saudeClinicas.agenda.status.${a.status}`)}</span>
                        {a.payment_status === "pago" && <span className="sc-agenda-card-pago">{t("saudeClinicas.agenda.pago")}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modal && (
        <AppointmentModal
          initialDate={modal.initialDate}
          initialTime={modal.initialTime}
          initialPatientId={modal.patientId}
          agendamentoExistente={modal.agendamentoExistente}
          patients={patients}
          procedures={procedures}
          professionals={professionals}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await carregarAgenda(); await carregarApoio(); }}
        />
      )}
      {detalhe && (
        <AppointmentDetailModal
          appointment={detalhe}
          patient={patients.find((p) => p.id === detalhe.patient_id) || { id: detalhe.patient_id, name: detalhe.patient_name, phone: detalhe.patient_phone }}
          onClose={() => setDetalhe(null)}
          onChanged={async () => {
            const atualizadas = await carregarAgenda();
            setDetalhe((atual) => (atual ? atualizadas.find((a) => a.id === atual.id) || null : null));
          }}
          onEditar={() => { setModal({ agendamentoExistente: detalhe }); setDetalhe(null); }}
        />
      )}
      {waitlistAberta && (
        <WaitlistModal
          professionals={professionals}
          procedures={procedures}
          onClose={() => setWaitlistAberta(false)}
          onConverted={async () => { await carregarAgenda(); await carregarApoio(); }}
        />
      )}
      {printAberto && <PrintModal onClose={() => setPrintAberto(false)} />}
    </div>
  );
}
