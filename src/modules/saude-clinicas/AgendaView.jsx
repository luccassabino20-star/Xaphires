import { useEffect, useMemo, useRef, useState } from "react";
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

// Status na ordem em que aparecem na legenda e nos filtros - mesma ordem do
// ciclo natural de um agendamento (marcado -> confirmado -> em atendimento ->
// concluído, com cancelado/faltou por fora). A cor de cada um é fixa por
// status (não muda com o tema de cor da clínica - ver CSS
// .sc-agenda-card-<status>), porque o significado é universal, diferente do
// destaque (--accent) que é identidade visual da clínica.
const STATUS_AGENDA = ["agendado", "confirmado", "em_atendimento", "concluido", "cancelado", "faltou"];

function rotuloDia(dataCivil, t) {
  const d = new Date(dataCivil + "T00:00:00");
  const semana = t(`saudeClinicas.agenda.diaSemana.${d.getDay()}`);
  const data = `${d.getDate()}/${t(`saudeClinicas.agenda.mes.${d.getMonth()}`)}`;
  return { semana, data };
}

// Nomes dos procedimentos escolhidos num agendamento - vem gravado como JSON
// livre em appointment.procedures (ver o comentário em schema.js: não é FK
// pra procedures, é preço/quantidade congelados na hora). O filtro por
// procedimento compara por nome contra o catálogo, então precisa reabrir
// esse JSON aqui no cliente.
function nomesProcedimentos(appointment) {
  try {
    const arr = typeof appointment.procedures === "string" ? JSON.parse(appointment.procedures) : appointment.procedures;
    return Array.isArray(arr) ? arr.map((p) => p.name) : [];
  } catch {
    return [];
  }
}

// Agenda semanal/diária: grade de slots de 15min à esquerda de cada dia,
// agendamentos e bloqueios posicionados por cima (position:absolute) pela
// hora de início e pela duração - mesma técnica de qualquer calendário web,
// sem biblioteca nova. Raias (agendaUtils.calcularRaias) evitam dois itens
// no mesmo horário desenharem um em cima do outro.
export default function AgendaView({ initialViewMode = "semana" }) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState(initialViewMode); // 'semana' | 'dia'
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
  const [telaCheia, setTelaCheia] = useState(false);
  const containerRef = useRef(null);
  // Filtros da barra de cima: "" em qualquer um deles é "todos". Sala fica de
  // fora de propósito - não existe cadastro de sala ainda (ver comentário do
  // select mais abaixo), então o campo aparece desabilitado.
  const [filtroProfissional, setFiltroProfissional] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroProcedimento, setFiltroProcedimento] = useState("");
  // Preview de drag-and-drop/resize: { id, dado, dia, slot, duracaoSlots } ou
  // null fora de arrasto. Nunca toca em `appointments` durante o gesto - só
  // troca o que é desenhado por cima; se o PATCH falhar (ex. conflito de
  // horário), soltar o dedo simplesmente limpa isso e o card volta sozinho
  // pra posição original, sem precisar de rollback de estado.
  const [arrasto, setArrasto] = useState(null);
  // true assim que um gesto passa do limiar de "foi só um clique" - o board
  // onClick do card confere essa ref pra não abrir o modal de detalhes
  // depois de um arraste (setPointerCapture garante que o click ainda cai no
  // mesmo botão mesmo tendo soltado em cima de outra célula da grade).
  const arrastouRef = useRef(false);

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

// Agendamento passa nos três filtros da barra (profissional/status/
  // procedimento) - "" em qualquer um é "não filtra por isso". Bloqueio só
  // reage ao filtro de profissional (não tem status nem procedimento), e
  // continua aparecendo quando o filtro pede outro profissional mas o
  // bloqueio vale pra agenda inteira (professional_user_id nulo).
  function passaNosFiltros(a) {
    if (filtroProfissional && a.professional_user_id !== filtroProfissional) return false;
    if (filtroStatus && a.status !== filtroStatus) return false;
    if (filtroProcedimento && !nomesProcedimentos(a).includes(filtroProcedimento)) return false;
    return true;
  }

  function itensDoDia(dataCivil) {
    const ags = appointments
      .filter((a) => a.date === dataCivil && passaNosFiltros(a))
      .map((a) => ({ id: "a" + a.id, tipo: "agendamento", dado: a, inicioMin: paraMinutos(a.time), fimMin: paraMinutos(a.time) + a.duration_min }));
    const bls = blocks
      .filter((b) => b.date === dataCivil && (!filtroProfissional || !b.professional_user_id || b.professional_user_id === filtroProfissional))
      .map((b) => ({ id: "b" + b.id, tipo: "bloqueio", dado: b, inicioMin: paraMinutos(b.time), fimMin: paraMinutos(b.time) + b.duration_min }));
    const todos = [...ags, ...bls];
    const raias = calcularRaias(todos);
    return todos.map((it) => ({ ...it, ...raias.get(it.id) }));
  }

  function alternarTelaCheia() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().then(() => setTelaCheia(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setTelaCheia(false)).catch(() => {});
    }
  }
  // O navegador também sai de tela cheia pela tecla Esc (sem passar por
  // alternarTelaCheia) - sem este listener o botão ficava com o rótulo
  // trocado (mostrando "Sair" quando já tinha saído).
  useEffect(() => {
    function onChange() { setTelaCheia(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => minutosParaHora(HORA_INICIO + i * PASSO_MIN));

  const LIMIAR_ARRASTO_PX = 4; // abaixo disso ainda é considerado um clique, não um arraste

  async function confirmarMovimento(a, novoDia, novoSlot) {
    const novoTime = minutosParaHora(HORA_INICIO + novoSlot * PASSO_MIN);
    if (novoDia === a.date && novoTime === a.time) return;
    try {
      await api.scUpdateAppointment(a.id, { date: novoDia, time: novoTime });
      await carregarAgenda();
    } catch (e) {
      setErro(translateError(e, t));
    }
  }

  async function confirmarRedimensionamento(a, duracaoSlots) {
    const novaDuracaoMin = duracaoSlots * PASSO_MIN;
    if (novaDuracaoMin === a.duration_min) return;
    try {
      await api.scUpdateAppointment(a.id, { durationMin: novaDuracaoMin });
      await carregarAgenda();
    } catch (e) {
      setErro(translateError(e, t));
    }
  }

  // Arrastar o card inteiro: muda dia (troca de coluna, na visão semana) e/ou
  // horário. A posição é lida a cada movimento por elementFromPoint - mais
  // simples e mais robusto que medir cada coluna na mão, e funciona igual em
  // "dia" e "semana" sem precisar de dois caminhos de código.
  function iniciarArrastoAgendamento(e, item) {
    const a = item.dado;
    if (a.status === "cancelado") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastouRef.current = false;

    const startX = e.clientX;
    const startY = e.clientY;
    const cardRect = e.currentTarget.getBoundingClientRect();
    const grabOffsetY = startY - cardRect.top;
    const duracaoSlots = Math.max(1, Math.round(a.duration_min / PASSO_MIN));
    let arrastando = false;

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!arrastando && Math.abs(dx) < LIMIAR_ARRASTO_PX && Math.abs(dy) < LIMIAR_ARRASTO_PX) return;
      arrastando = true;
      arrastouRef.current = true;
      document.body.style.cursor = "grabbing";

      const alvo = document.elementFromPoint(ev.clientX, ev.clientY);
      const dayEl = alvo && alvo.closest(".sc-agenda-day-body");
      if (!dayEl) return; // ponteiro saiu da grade - mantém o preview anterior
      const dayRect = dayEl.getBoundingClientRect();
      const localY = ev.clientY - dayRect.top - grabOffsetY;
      let novoSlot = Math.round(localY / SLOT_ALTURA);
      novoSlot = Math.max(0, Math.min(novoSlot, TOTAL_SLOTS - duracaoSlots));
      setArrasto({ id: item.id, dado: a, dia: dayEl.dataset.dia, slot: novoSlot, duracaoSlots });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      if (!arrastando) return;
      setArrasto((atual) => {
        if (atual && atual.id === item.id) confirmarMovimento(a, atual.dia, atual.slot);
        return null;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Puxar a borda de baixo do card: só muda a duração, sempre no mesmo dia e
  // no mesmo horário de início - por isso não precisa do elementFromPoint,
  // só da posição vertical dentro do dia onde o card já está.
  function iniciarRedimensionamento(e, item) {
    e.stopPropagation(); // não deixa o pointerdown também iniciar o "mover" do card
    const a = item.dado;
    if (a.status === "cancelado") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastouRef.current = false;

    const dayEl = e.currentTarget.closest(".sc-agenda-day-body");
    const dayRect = dayEl.getBoundingClientRect();
    const inicioSlot = slotDoHorario(a.time);
    const startY = e.clientY;
    let arrastando = false;

    function onMove(ev) {
      if (!arrastando && Math.abs(ev.clientY - startY) < LIMIAR_ARRASTO_PX) return;
      arrastando = true;
      arrastouRef.current = true;
      document.body.style.cursor = "ns-resize";

      const localY = ev.clientY - dayRect.top;
      let fimSlot = Math.round(localY / SLOT_ALTURA);
      fimSlot = Math.max(inicioSlot + 1, Math.min(fimSlot, TOTAL_SLOTS));
      setArrasto({ id: item.id, dado: a, dia: a.date, slot: inicioSlot, duracaoSlots: fimSlot - inicioSlot });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      if (!arrastando) return;
      setArrasto((atual) => {
        if (atual && atual.id === item.id) confirmarRedimensionamento(a, atual.duracaoSlots);
        return null;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div className={"sc-agenda" + (telaCheia ? " sc-agenda-tela-cheia" : "")} ref={containerRef}>
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
          <button type="button" className="btn-ghost btn-small" onClick={() => setPrintAberto(true)}>{t("saudeClinicas.agenda.exportar")}</button>
          <button type="button" className="icon-btn" title={t(telaCheia ? "saudeClinicas.agenda.sairTelaCheia" : "saudeClinicas.agenda.telaCheia")} onClick={alternarTelaCheia}>
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d={telaCheia
                ? "M9 4v3a2 2 0 0 1-2 2H4M15 4v3a2 2 0 0 0 2 2h3M9 20v-3a2 2 0 0 0-2-2H4M15 20v-3a2 2 0 0 1 2-2h3"
                : "M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3"} />
            </svg>
          </button>
          <button type="button" className="btn-primary btn-small" onClick={() => abrirNovoAgendamento()}>{t("saudeClinicas.agenda.novoAgendamento")}</button>
        </div>
      </div>

      <div className="sc-agenda-filtros">
        <select className="sc-agenda-filtro" value={filtroProfissional} onChange={(e) => setFiltroProfissional(e.target.value)}>
          <option value="">{t("saudeClinicas.agenda.filtroProfissionalTodos")}</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {/* Não existe cadastro de sala ainda - o filtro fica reservado aqui,
            desabilitado, pra não prometer um recurso que não existe (mesmo
            tratamento de "Em breve" do resto do módulo). */}
        <select className="sc-agenda-filtro" disabled title={t("modules.comingSoon")}>
          <option value="">{t("saudeClinicas.agenda.filtroSalaTodas")}</option>
        </select>
        <select className="sc-agenda-filtro" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="">{t("saudeClinicas.agenda.filtroStatusTodos")}</option>
          {STATUS_AGENDA.map((s) => (
            <option key={s} value={s}>{t(`saudeClinicas.agenda.status.${s}`)}</option>
          ))}
        </select>
        <select className="sc-agenda-filtro" value={filtroProcedimento} onChange={(e) => setFiltroProcedimento(e.target.value)}>
          <option value="">{t("saudeClinicas.agenda.filtroProcedimentoTodos")}</option>
          {procedures.map((p) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
        {(filtroProfissional || filtroStatus || filtroProcedimento) && (
          <button type="button" className="btn-ghost btn-small" onClick={() => { setFiltroProfissional(""); setFiltroStatus(""); setFiltroProcedimento(""); }}>
            {t("saudeClinicas.agenda.limparFiltros")}
          </button>
        )}

        <div className="sc-agenda-legenda">
          {STATUS_AGENDA.map((s) => (
            <span key={s} className="sc-agenda-legenda-item">
              <i className={"sc-agenda-legenda-dot sc-agenda-legenda-dot-" + s} />
              {t(`saudeClinicas.agenda.legenda.${s}`)}
            </span>
          ))}
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
                <div className="sc-agenda-day-body" data-dia={dia} style={{ height: TOTAL_SLOTS * SLOT_ALTURA }}>
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
                  {itensDoDia(dia).filter((it) => !arrasto || arrasto.id !== it.id).map((it) => {
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
                    const arrastavel = a.status !== "cancelado";
                    const profissional = professionals.find((p) => p.id === a.professional_user_id);
                    const paciente = patients.find((p) => p.id === a.patient_id);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        className={"sc-agenda-card sc-agenda-card-" + a.status + (arrastavel ? " sc-agenda-card-arrastavel" : "")}
                        style={estilo}
                        onPointerDown={arrastavel ? (e) => iniciarArrastoAgendamento(e, it) : undefined}
                        onClick={() => {
                          if (arrastouRef.current) { arrastouRef.current = false; return; }
                          setDetalhe(a);
                        }}
                      >
                        <span className="sc-agenda-card-top" />
                        <span className="sc-agenda-card-hora">{a.time} - {minutosParaHora(paraMinutos(a.time) + a.duration_min)}</span>
                        <span className="sc-agenda-card-nome">{a.patient_name}</span>
                        {profissional && <span className="sc-agenda-card-prof">{profissional.name}</span>}
                        <span className="sc-agenda-card-status-label">{t(`saudeClinicas.agenda.status.${a.status}`)}</span>
                        {a.payment_status === "pago" && <span className="sc-agenda-card-pago">{t("saudeClinicas.agenda.pago")}</span>}
                        {paciente?.sms_reminder_opt_in === 1 && (
                          <span className="sc-agenda-card-whats" title={t("saudeClinicas.agenda.lembreteAtivo")}>
                            <svg viewBox="0 0 24 24" width="10" height="10"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20zm4.4-5.5c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.7.9-.3.2-.5.1a6.6 6.6 0 0 1-1.9-1.2 7.1 7.1 0 0 1-1.3-1.6c-.1-.2 0-.3.1-.4l.3-.4.2-.3a.5.5 0 0 0 0-.4c-.1-.1-.5-1.3-.7-1.7s-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.7 2.7 0 0 0-.8 2 4.7 4.7 0 0 0 1 2.5 10.6 10.6 0 0 0 4.1 3.6c.6.2 1 .4 1.4.5a3.3 3.3 0 0 0 1.5.1 2.5 2.5 0 0 0 1.6-1.1 1.9 1.9 0 0 0 .1-1.1c-.1-.1-.2-.2-.4-.3z" /></svg>
                          </span>
                        )}
                        {arrastavel && (
                          <span
                            className="sc-agenda-card-resize"
                            onPointerDown={(e) => iniciarRedimensionamento(e, it)}
                          />
                        )}
                      </button>
                    );
                  })}
                  {arrasto && arrasto.dia === dia && (
                    <div
                      className={"sc-agenda-card sc-agenda-card-preview sc-agenda-card-" + arrasto.dado.status}
                      style={{
                        top: arrasto.slot * SLOT_ALTURA,
                        height: arrasto.duracaoSlots * SLOT_ALTURA,
                        left: 0,
                        width: "calc(100% - 3px)",
                      }}
                    >
                      <span className="sc-agenda-card-top" />
                      <span className="sc-agenda-card-hora">
                        {minutosParaHora(HORA_INICIO + arrasto.slot * PASSO_MIN)} - {minutosParaHora(HORA_INICIO + (arrasto.slot + arrasto.duracaoSlots) * PASSO_MIN)}
                      </span>
                      <span className="sc-agenda-card-nome">{arrasto.dado.patient_name}</span>
                    </div>
                  )}
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
