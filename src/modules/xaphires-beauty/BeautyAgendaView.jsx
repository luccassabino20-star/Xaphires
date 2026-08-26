import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyEmptyState from "./BeautyEmptyState.jsx";
import Avatar from "../../components/Avatar.jsx";
import AppointmentDetailView from "./AppointmentDetailView.jsx";

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Helpers de data civil (Fase 9) - mesma forma de agendaUtils.js em Saúde &
// Clínicas, reescritos localmente aqui (o módulo não importa do outro,
// mesma decisão de "não compartilhar tabela" já tomada antes).
function parseDataCivil(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function paraCivil(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function adicionarDias(s, n) {
  const d = parseDataCivil(s);
  d.setDate(d.getDate() + n);
  return paraCivil(d);
}
function adicionarMeses(s, n) {
  const d = parseDataCivil(s);
  d.setMonth(d.getMonth() + n, 1);
  return paraCivil(d);
}
function segundaDaSemana(s) {
  const d = parseDataCivil(s);
  const diaSemana = d.getDay();
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + offset);
  return paraCivil(d);
}
function diasDaSemana(segunda) {
  return Array.from({ length: 7 }, (_, i) => adicionarDias(segunda, i));
}
function formatarDiaCurto(s, lang) {
  const d = parseDataCivil(s);
  const rotulo = new Intl.DateTimeFormat(lang, { weekday: "short", day: "2-digit", month: "2-digit" }).format(d);
  return rotulo.replace(".", "");
}
function formatarDiaPorExtenso(s, lang) {
  const d = parseDataCivil(s);
  const rotulo = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long" }).format(d);
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}
function formatarValor(cents, locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}

// Grade de horário (Dia): 08:00-20:00, 1px por minuto (60px/hora) - simples o
// bastante pra não precisar de raias por sobreposição, porque o servidor já
// impede dois agendamentos do MESMO profissional se cruzarem (hasOverlap).
// Só a coluna "sem profissional" pode, em tese, ter itens sobrepostos (sem
// profissional atribuído não é checado) - aceitável, mesmo espírito de "não
// resolver o caso raro" do resto do módulo.
const HORA_INICIO = 8 * 60;
const HORA_FIM = 20 * 60;
const SEM_PROFISSIONAL = "__sem__";

const FORM_VAZIO = { clientId: "", serviceId: "", staffId: "", date: hojeCivil(), time: "09:00", notes: "", repeatFrequency: "none", repeatOccurrences: "4" };
const BLOCK_VAZIO = { staffId: "", date: hojeCivil(), startTime: "12:00", endTime: "13:00", reason: "" };
const BADGE_POR_STATUS = { agendado: "beauty-badge-agendado", concluido: "beauty-badge-concluido", cancelado: "beauty-badge-cancelado" };

// Agenda: visão Dia (grade com uma coluna por profissional, mini-calendário e
// resumo do dia - redesenho pedido pelo cliente) e visão Semana (7 colunas,
// como a Fase 9 entregou), com filtro por profissional nas duas. starts_at é
// sempre data/hora civil "ingênua" (sem Z) - a hora do relógio de quem
// agenda, nunca UTC. "Repetir" gera N ocorrências de uma vez na criação
// (sem motor de recorrência automática); "Duplicar" só pré-preenche o
// formulário com os dados de um agendamento existente.
export default function BeautyAgendaView() {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [visao, setVisao] = useState("dia"); // dia | semana
  const [date, setDate] = useState(hojeCivil());
  const [mesCalendario, setMesCalendario] = useState(() => paraCivil(new Date(parseDataCivil(hojeCivil()).getFullYear(), parseDataCivil(hojeCivil()).getMonth(), 1)));
  const [staffSelecionados, setStaffSelecionados] = useState(null); // null até a equipe carregar (então vira o Set com todo mundo)
  const [buscaCliente, setBuscaCliente] = useState("");
  const [agendamentos, setAgendamentos] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [horariosPorStaff, setHorariosPorStaff] = useState({});
  const [erro, setErro] = useState("");
  const [f, setF] = useState(FORM_VAZIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [fBlock, setFBlock] = useState(BLOCK_VAZIO);
  const [mostrarBlockForm, setMostrarBlockForm] = useState(false);
  const [selecionado, setSelecionado] = useState(null); // agendamento em destaque na barra inferior (visão Dia)
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  async function carregarBase() {
    try {
      const [c, s, eq] = await Promise.all([api.xbGetClients(), api.xbGetServices(), api.xbGetStaff().catch(() => [])]);
      setClientes(c);
      setServicos(s);
      setEquipe(eq);
      setStaffSelecionados(new Set([...eq.map((s2) => s2.id), SEM_PROFISSIONAL]));
      const horarios = {};
      await Promise.all(
        eq.map(async (s2) => {
          horarios[s2.id] = await api.xbGetStaffHours(s2.id).catch(() => []);
        })
      );
      setHorariosPorStaff(horarios);
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  const segunda = useMemo(() => segundaDaSemana(date), [date]);
  const dias = useMemo(() => (visao === "semana" ? diasDaSemana(segunda) : [date]), [visao, segunda, date]);

  async function carregarAgenda() {
    const from = visao === "semana" ? `${segunda}T00:00:00` : `${date}T00:00:00`;
    const to = visao === "semana" ? `${adicionarDias(segunda, 6)}T23:59:59` : `${date}T23:59:59`;
    try {
      const [ag, bl] = await Promise.all([api.xbGetAppointments(from, to), api.xbGetBlocks(from, to)]);
      setAgendamentos(ag);
      setBloqueios(bl);
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregarBase();
    // eslint-disable-next-line
  }, []);
  useEffect(() => {
    carregarAgenda();
    // eslint-disable-next-line
  }, [date, visao]);

  function staffMarcado(chave) {
    return !staffSelecionados || staffSelecionados.has(chave);
  }
  function alternarStaff(chave) {
    setStaffSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }
  const todosMarcados = staffSelecionados && staffSelecionados.size === equipe.length + 1;
  function alternarTodos() {
    setStaffSelecionados(todosMarcados ? new Set() : new Set([...equipe.map((s) => s.id), SEM_PROFISSIONAL]));
  }

  function itensDoDia(dia) {
    const ags = agendamentos
      .filter((a) => a.starts_at.slice(0, 10) === dia)
      .filter((a) => staffMarcado(a.staff_id || SEM_PROFISSIONAL))
      .filter((a) => !buscaCliente.trim() || a.client_name.toLowerCase().includes(buscaCliente.trim().toLowerCase()))
      .map((a) => ({ tipo: "agendamento", horario: a.starts_at.slice(11, 16), dado: a }));
    const bls = bloqueios
      .filter((b) => b.starts_at.slice(0, 10) === dia)
      .filter((b) => !b.staff_id || staffMarcado(b.staff_id))
      .map((b) => ({ tipo: "bloqueio", horario: b.starts_at.slice(11, 16), dado: b }));
    return [...ags, ...bls].sort((x, y) => x.horario.localeCompare(y.horario));
  }

  function abrirNovo(diaPreset, staffPreset, timePreset) {
    setF({ ...FORM_VAZIO, date: diaPreset || date, staffId: staffPreset || "", time: timePreset || "09:00" });
    setMostrarForm(true);
  }
  function duplicar(a) {
    setF({
      clientId: a.client_id,
      serviceId: a.service_id,
      staffId: a.staff_id || "",
      date: a.starts_at.slice(0, 10),
      time: a.starts_at.slice(11, 16),
      notes: a.notes || "",
      repeatFrequency: "none",
      repeatOccurrences: "4",
    });
    setMostrarForm(true);
  }

  async function salvar(e) {
    e.preventDefault();
    if (!f.clientId || !f.serviceId || !f.time || !f.date) return;
    try {
      const payload = {
        clientId: f.clientId,
        serviceId: f.serviceId,
        staffId: f.staffId || null,
        startsAt: `${f.date}T${f.time}:00`,
        notes: f.notes,
      };
      if (f.repeatFrequency !== "none") {
        payload.repeat = { frequency: f.repeatFrequency, occurrences: Number(f.repeatOccurrences) || 4 };
      }
      const criado = await api.xbCreateAppointment(payload);
      if (criado.repeatSummary) {
        showToast(t("modules.xaphiresBeauty.agenda.repetidoResumo", { criadas: criado.repeatSummary.criadas, total: criado.repeatSummary.criadas + criado.repeatSummary.puladas }));
      } else {
        showToast(t("modules.xaphiresBeauty.agenda.salvo"));
      }
      setF(FORM_VAZIO);
      setMostrarForm(false);
      await carregarAgenda();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function mudarStatus(id, status) {
    try {
      await api.xbSetAppointmentStatus(id, status);
      setSelecionado(null);
      await carregarAgenda();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function copiarLinkLembrete(id) {
    try {
      const { slug } = await api.xbGetReminderLink(id);
      const url = `${window.location.origin}/beauty-lembrete/${slug}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast(t("modules.xaphiresBeauty.agenda.linkCopiado"));
      } catch {
        window.prompt(t("modules.xaphiresBeauty.agenda.linkLembrete"), url);
      }
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function salvarBloqueio(e) {
    e.preventDefault();
    if (!fBlock.startTime || !fBlock.endTime || !fBlock.date) return;
    try {
      await api.xbCreateBlock({
        staffId: fBlock.staffId || null,
        startsAt: `${fBlock.date}T${fBlock.startTime}:00`,
        endsAt: `${fBlock.date}T${fBlock.endTime}:00`,
        reason: fBlock.reason,
      });
      showToast(t("modules.xaphiresBeauty.agenda.bloqueioCriado"));
      setFBlock(BLOCK_VAZIO);
      setMostrarBlockForm(false);
      await carregarAgenda();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }
  async function removerBloqueio(id) {
    if (!window.confirm(t("modules.xaphiresBeauty.agenda.confirmarRemoverBloqueio"))) return;
    try {
      await api.xbDeleteBlock(id);
      await carregarAgenda();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  function linhaAgendamento(a) {
    return (
      <div className="beauty-list-row" key={a.id}>
        <span className="beauty-cell-primary" style={{ width: 56 }}>{a.starts_at.slice(11, 16)}</span>
        <span style={{ flex: 1.4, display: "flex", alignItems: "center", gap: 8 }}>
          {a.client_name}
          {!!a.from_public_link && <span className="beauty-badge beauty-badge-online">{t("modules.xaphiresBeauty.agenda.online")}</span>}
        </span>
        <span className="beauty-cell-muted" style={{ flex: 1 }}>{a.service_name}</span>
        <span className="beauty-cell-muted" style={{ flex: 1 }}>{a.staff_name || "—"}</span>
        <span style={{ width: 100 }}>
          <span className={"beauty-badge " + BADGE_POR_STATUS[a.status]}>{t(`modules.xaphiresBeauty.agenda.status.${a.status}`)}</span>
        </span>
        <span className="beauty-col-actions">
          {a.status === "agendado" && (
            <>
              <button type="button" className="btn-ghost" onClick={() => mudarStatus(a.id, "concluido")}>{t("modules.xaphiresBeauty.agenda.concluir")}</button>
              <button type="button" className="btn-ghost" onClick={() => mudarStatus(a.id, "cancelado")}>{t("modules.xaphiresBeauty.agenda.cancelar")}</button>
            </>
          )}
          <button type="button" className="btn-ghost" onClick={() => duplicar(a)}>{t("modules.xaphiresBeauty.agenda.duplicar")}</button>
          <button type="button" className="btn-ghost" onClick={() => copiarLinkLembrete(a.id)}>{t("modules.xaphiresBeauty.agenda.linkLembrete")}</button>
        </span>
      </div>
    );
  }
  function linhaBloqueio(b) {
    return (
      <div className="beauty-list-row beauty-block-row" key={b.id}>
        <span className="beauty-cell-primary" style={{ width: 56 }}>{b.starts_at.slice(11, 16)}</span>
        <span style={{ flex: 1.4 }}>{t("modules.xaphiresBeauty.agenda.bloqueio")}{b.reason ? ` - ${b.reason}` : ""}</span>
        <span className="beauty-cell-muted" style={{ flex: 1 }}></span>
        <span className="beauty-cell-muted" style={{ flex: 1 }}>{b.staff_name || t("modules.xaphiresBeauty.agenda.todaEquipe")}</span>
        <span style={{ width: 100 }} />
        <span className="beauty-col-actions">
          <button type="button" className="btn-ghost" onClick={() => removerBloqueio(b.id)}>{t("common.remove")}</button>
        </span>
      </div>
    );
  }

  const itensDoDiaAtual = itensDoDia(date);

  // Colunas da grade (visão Dia): um profissional selecionado por coluna, e
  // "sem profissional" só quando marcado E existe algo pra mostrar - senão
  // uma coluna vazia por padrão só polui a grade de quem nem usa esse caso.
  const staffDaGrade = equipe.filter((s) => staffMarcado(s.id));
  const temSemProfissional = staffMarcado(SEM_PROFISSIONAL) && itensDoDiaAtual.some((it) => it.tipo === "agendamento" && !it.dado.staff_id);
  const colunas = [...staffDaGrade.map((s) => ({ id: s.id, nome: s.name, cor: s.color })), ...(temSemProfissional ? [{ id: SEM_PROFISSIONAL, nome: t("modules.xaphiresBeauty.agenda.semProfissional"), cor: "#8A7A7D" }] : [])];

  const ehHoje = date === hojeCivil();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const horaAgoraLabel = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;

  const horasDoEixo = useMemo(() => {
    const lista = [];
    for (let m = HORA_INICIO; m <= HORA_FIM; m += 60) lista.push(m);
    return lista;
  }, []);

  // RESUMO DO DIA: faturamento previsto (soma do preço do serviço dos
  // agendamentos não cancelados do dia) e taxa de ocupação (minutos
  // ocupados / minutos disponíveis dos profissionais selecionados). Quem
  // não tem horário de trabalho cadastrado (Fase 8 é opcional) conta a
  // grade inteira exibida como disponível, em vez de zero - senão a taxa
  // ficaria sempre 0% pra quem nunca configurou horário.
  const resumoDoDia = useMemo(() => {
    const ags = agendamentos.filter((a) => a.starts_at.slice(0, 10) === date && a.status !== "cancelado");
    const faturamentoPrevisto = ags.reduce((s, a) => s + (a.price_cents || 0), 0);
    const weekday = parseDataCivil(date).getDay();
    let disponivel = 0;
    let ocupado = 0;
    for (const s of staffDaGrade) {
      const horarios = horariosPorStaff[s.id] || [];
      if (horarios.length === 0) {
        disponivel += HORA_FIM - HORA_INICIO;
      } else {
        const doDia = horarios.find((h) => h.weekday === weekday);
        if (doDia) {
          const [h1, m1] = doDia.start_time.split(":").map(Number);
          const [h2, m2] = doDia.end_time.split(":").map(Number);
          disponivel += h2 * 60 + m2 - (h1 * 60 + m1);
        }
      }
      ocupado += ags.filter((a) => a.staff_id === s.id).reduce((s2, a) => s2 + (a.duration_minutes || 0), 0);
    }
    const taxaOcupacao = disponivel > 0 ? Math.min(100, Math.round((ocupado / disponivel) * 100)) : null;
    return { faturamentoPrevisto, taxaOcupacao };
  }, [agendamentos, date, staffDaGrade, horariosPorStaff]);

  return (
    <div>
      <div className="beauty-page-head">
        <div>
          <h2 className="beauty-page-title">{visao === "dia" ? formatarDiaPorExtenso(date, i18n.language) : t("modules.xaphiresBeauty.tabs.agenda")}</h2>
          {visao === "dia" && (
            <p className="beauty-cell-muted" style={{ margin: "2px 0 0" }}>
              {t("modules.xaphiresBeauty.agenda.resumoProfissionais", { count: colunas.length })}
              {" • "}
              {t("modules.xaphiresBeauty.agenda.resumoAgendamentos", { count: itensDoDiaAtual.filter((it) => it.tipo === "agendamento").length })}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="beauty-view-toggle">
            <button type="button" className={visao === "dia" ? "active" : ""} onClick={() => setVisao("dia")}>{t("modules.xaphiresBeauty.agenda.visaoDia")}</button>
            <button type="button" className={visao === "semana" ? "active" : ""} onClick={() => setVisao("semana")}>{t("modules.xaphiresBeauty.agenda.visaoSemana")}</button>
          </div>
          {visao === "dia" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button type="button" className="btn-ghost" onClick={() => setDate(adicionarDias(date, -1))}>‹</button>
              <button type="button" className="btn-ghost" onClick={() => setDate(hojeCivil())}>{t("modules.xaphiresBeauty.agenda.hoje")}</button>
              <button type="button" className="btn-ghost" onClick={() => setDate(adicionarDias(date, 1))}>›</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" className="btn-ghost" onClick={() => setDate(adicionarDias(date, -7))}>‹</button>
              <span className="beauty-cell-muted">{formatarDiaCurto(segunda, i18n.language)} - {formatarDiaCurto(adicionarDias(segunda, 6), i18n.language)}</span>
              <button type="button" className="btn-ghost" onClick={() => setDate(adicionarDias(date, 7))}>›</button>
            </div>
          )}
          <input type="text" placeholder={t("modules.xaphiresBeauty.agenda.buscarCliente")} value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} style={{ maxWidth: 160 }} />
          <button type="button" className="icon-btn" title={t("modules.xaphiresBeauty.agenda.exportar")} onClick={() => window.print()}>
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
          </button>
          <button type="button" className="btn-primary" onClick={() => (mostrarForm ? setMostrarForm(false) : abrirNovo())}>
            {mostrarForm ? t("common.cancel") : t("modules.xaphiresBeauty.agenda.novo")}
          </button>
        </div>
      </div>

      {mostrarBlockForm && (
        <div className="beauty-card" style={{ marginBottom: 18 }}>
          <form className="beauty-form" onSubmit={salvarBloqueio}>
            <select value={fBlock.staffId} onChange={(e) => setFBlock({ ...fBlock, staffId: e.target.value })}>
              <option value="">{t("modules.xaphiresBeauty.agenda.todaEquipe")}</option>
              {equipe.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input type="date" value={fBlock.date} onChange={(e) => setFBlock({ ...fBlock, date: e.target.value })} />
            <input type="time" value={fBlock.startTime} onChange={(e) => setFBlock({ ...fBlock, startTime: e.target.value })} />
            <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.agenda.ate")}</span>
            <input type="time" value={fBlock.endTime} onChange={(e) => setFBlock({ ...fBlock, endTime: e.target.value })} />
            <input type="text" placeholder={t("modules.xaphiresBeauty.agenda.motivoBloqueio")} value={fBlock.reason} onChange={(e) => setFBlock({ ...fBlock, reason: e.target.value })} />
            <button type="submit" className="btn-primary">{t("common.save")}</button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarBlockForm(false)}>{t("common.cancel")}</button>
          </form>
        </div>
      )}

      {mostrarForm && (
        <div className="beauty-card" style={{ marginBottom: 18 }}>
          <form className="beauty-form" onSubmit={salvar}>
            <select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
              <option value="">{t("modules.xaphiresBeauty.agenda.escolherCliente")}</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>
              <option value="">{t("modules.xaphiresBeauty.agenda.escolherServico")}</option>
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })}>
              <option value="">{t("modules.xaphiresBeauty.agenda.semPreferencia")}</option>
              {equipe.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <input type="time" step={900} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
            <input type="text" placeholder={t("modules.xaphiresBeauty.agenda.notas")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            <select value={f.repeatFrequency} onChange={(e) => setF({ ...f, repeatFrequency: e.target.value })}>
              <option value="none">{t("modules.xaphiresBeauty.agenda.repetirNenhuma")}</option>
              <option value="weekly">{t("modules.xaphiresBeauty.agenda.repetirSemanal")}</option>
              <option value="monthly">{t("modules.xaphiresBeauty.agenda.repetirMensal")}</option>
            </select>
            {f.repeatFrequency !== "none" && (
              <input
                type="number"
                min="2"
                max="12"
                placeholder={t("modules.xaphiresBeauty.agenda.ocorrencias")}
                value={f.repeatOccurrences}
                onChange={(e) => setF({ ...f, repeatOccurrences: e.target.value })}
                style={{ maxWidth: 110 }}
              />
            )}
            <button type="submit" className="btn-primary">{t("common.save")}</button>
          </form>
        </div>
      )}

      {erro && <div className="beauty-error">{erro}</div>}

      {visao === "dia" ? (
        <div className="beauty-agenda-layout">
          <aside className="beauty-agenda-side">
            <BeautyMiniCalendario mes={mesCalendario} selecionado={date} onMudarMes={setMesCalendario} onSelecionar={setDate} lang={i18n.language} />

            <div className="beauty-agenda-side-section">
              <h4 className="beauty-agenda-side-title">{t("modules.xaphiresBeauty.agenda.profissionais")}</h4>
              <label className="beauty-agenda-check">
                <input type="checkbox" checked={!!todosMarcados} onChange={alternarTodos} />
                {t("modules.xaphiresBeauty.agenda.todosProfissionais")}
              </label>
              {equipe.map((s) => (
                <label className="beauty-agenda-check" key={s.id}>
                  <input type="checkbox" checked={staffMarcado(s.id)} onChange={() => alternarStaff(s.id)} />
                  <span className="beauty-agenda-check-dot" style={{ background: s.color || "#B76E79" }} />
                  {s.name}
                </label>
              ))}
              <button type="button" className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setMostrarBlockForm((v) => !v)}>
                {mostrarBlockForm ? t("common.cancel") : t("modules.xaphiresBeauty.agenda.novoBloqueio")}
              </button>
            </div>

            <div className="beauty-agenda-resumo">
              <h4 className="beauty-agenda-side-title">{t("modules.xaphiresBeauty.agenda.resumoDoDia")}</h4>
              <div className="beauty-agenda-resumo-item">
                <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.agenda.faturamentoPrevisto")}</span>
                <strong>{formatarValor(resumoDoDia.faturamentoPrevisto, i18n.language)}</strong>
              </div>
              <div className="beauty-agenda-resumo-item">
                <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.agenda.taxaOcupacao")}</span>
                <strong>{resumoDoDia.taxaOcupacao == null ? "—" : `${resumoDoDia.taxaOcupacao}%`}</strong>
              </div>
            </div>
          </aside>

          <div className="beauty-agenda-grid-wrap">
            {colunas.length === 0 ? (
              <div className="beauty-card"><BeautyEmptyState title={t("modules.xaphiresBeauty.agenda.semProfissionalSelecionado")} /></div>
            ) : (
              <div className="beauty-agenda-grid" style={{ "--beauty-agenda-cols": colunas.length }}>
                <div className="beauty-agenda-gutter">
                  <div className="beauty-agenda-gutter-head" />
                  <div className="beauty-agenda-gutter-track" style={{ height: HORA_FIM - HORA_INICIO }}>
                    {horasDoEixo.map((m) => (
                      <div key={m} className="beauty-agenda-gutter-hora" style={{ top: m - HORA_INICIO }}>
                        {String(Math.floor(m / 60)).padStart(2, "0")}:00
                      </div>
                    ))}
                    {ehHoje && minutosAgora >= HORA_INICIO && minutosAgora <= HORA_FIM && (
                      <div className="beauty-agenda-now-label" style={{ top: minutosAgora - HORA_INICIO }}>{horaAgoraLabel}</div>
                    )}
                  </div>
                </div>
                <div className="beauty-agenda-cols">
                  {colunas.map((col) => (
                    <div key={col.id} className="beauty-agenda-col">
                      <div className="beauty-agenda-col-head">
                        <Avatar id={col.id} name={col.nome} style={{ background: col.cor }} />
                        <span>{col.nome}</span>
                      </div>
                      <div
                        className="beauty-agenda-col-body"
                        style={{ height: HORA_FIM - HORA_INICIO }}
                        onClick={(e) => {
                          if (e.target !== e.currentTarget) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const min = Math.max(HORA_INICIO, Math.min(HORA_FIM, HORA_INICIO + Math.round((e.clientY - rect.top) / 30) * 30));
                          const hora = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
                          abrirNovo(date, col.id === SEM_PROFISSIONAL ? "" : col.id, hora);
                        }}
                      >
                        {horasDoEixo.map((m) => (
                          <div key={m} className="beauty-agenda-hline" style={{ top: m - HORA_INICIO }} />
                        ))}
                        {ehHoje && minutosAgora >= HORA_INICIO && minutosAgora <= HORA_FIM && (
                          <div className="beauty-agenda-now-line" style={{ top: minutosAgora - HORA_INICIO }} />
                        )}
                        {itensDoDiaAtual
                          .filter((it) => (it.tipo === "bloqueio" ? (!it.dado.staff_id || it.dado.staff_id === col.id) : (it.dado.staff_id || SEM_PROFISSIONAL) === col.id))
                          .map((it) => {
                            const inicioMin = parseInt(it.dado.starts_at.slice(11, 13), 10) * 60 + parseInt(it.dado.starts_at.slice(14, 16), 10);
                            const fimMin = it.tipo === "bloqueio"
                              ? parseInt(it.dado.ends_at.slice(11, 13), 10) * 60 + parseInt(it.dado.ends_at.slice(14, 16), 10)
                              : inicioMin + (it.dado.duration_minutes || 30);
                            const estilo = { top: Math.max(0, inicioMin - HORA_INICIO), height: Math.max(18, fimMin - inicioMin) };
                            if (it.tipo === "bloqueio") {
                              return (
                                <div key={"b" + it.dado.id} className="beauty-agenda-card beauty-agenda-card-bloqueio" style={estilo} title={it.dado.reason}>
                                  {t("modules.xaphiresBeauty.agenda.bloqueio")}{it.dado.reason ? `: ${it.dado.reason}` : ""}
                                </div>
                              );
                            }
                            const a = it.dado;
                            return (
                              <button
                                type="button"
                                key={a.id}
                                className={"beauty-agenda-card beauty-agenda-card-" + a.status}
                                style={estilo}
                                onClick={(e) => { e.stopPropagation(); setSelecionado(a); }}
                              >
                                <strong>{it.horario}</strong> {a.client_name}
                                <div className="beauty-agenda-card-sub">{a.service_name}</div>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="beauty-week-grid">
          {dias.map((dia) => {
            const itens = itensDoDia(dia);
            return (
              <div className="beauty-week-col" key={dia}>
                <div className="beauty-week-col-head">
                  <button type="button" className="beauty-week-col-title" onClick={() => { setDate(dia); setVisao("dia"); }}>
                    {formatarDiaCurto(dia, i18n.language)}
                  </button>
                  <button type="button" className="beauty-week-col-add" title={t("modules.xaphiresBeauty.agenda.novo")} onClick={() => abrirNovo(dia)}>+</button>
                </div>
                {itens.length === 0 ? (
                  <p className="beauty-cell-muted" style={{ fontSize: 12 }}>—</p>
                ) : (
                  itens.map((item) =>
                    item.tipo === "agendamento" ? (
                      <div className="beauty-week-item" key={item.dado.id}>
                        <strong>{item.horario}</strong> {item.dado.client_name}
                        <div className="beauty-cell-muted" style={{ fontSize: 11.5 }}>{item.dado.service_name}</div>
                      </div>
                    ) : (
                      <div className="beauty-week-item beauty-block-row" key={item.dado.id}>
                        <strong>{item.horario}</strong> {t("modules.xaphiresBeauty.agenda.bloqueio")}
                        {item.dado.reason ? <div className="beauty-cell-muted" style={{ fontSize: 11.5 }}>{item.dado.reason}</div> : null}
                      </div>
                    )
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {visao === "dia" && itensDoDiaAtual.length > 0 && (
        <div className="beauty-card" style={{ marginTop: 18 }}>
          <div className="beauty-list">
            <div className="beauty-list-head">
              <span style={{ width: 56 }}>{t("modules.xaphiresBeauty.agenda.horario")}</span>
              <span style={{ flex: 1.4 }}>{t("modules.xaphiresBeauty.agenda.colCliente")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.agenda.colServico")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.agenda.colProfissional")}</span>
              <span style={{ width: 100 }}>{t("modules.xaphiresBeauty.agenda.situacao")}</span>
            </div>
            {itensDoDiaAtual.map((item) => (item.tipo === "agendamento" ? linhaAgendamento(item.dado) : linhaBloqueio(item.dado)))}
          </div>
        </div>
      )}

      {selecionado && (
        <AppointmentDetailView
          appointment={selecionado}
          clientes={clientes}
          servicos={servicos}
          equipe={equipe}
          onClose={() => setSelecionado(null)}
          onChanged={carregarAgenda}
          onDuplicate={duplicar}
        />
      )}
    </div>
  );
}

// Mini calendário mensal (redesenho): clicar num dia muda o `date` da agenda
// sem esperar navegar mês a mês igual a ele - a navegação de mês (‹ ›) é só
// pra ver outro período, não muda o dia selecionado sozinha.
function BeautyMiniCalendario({ mes, selecionado, onMudarMes, onSelecionar, lang }) {
  const primeiroDiaSemana = parseDataCivil(mes).getDay();
  const diasNoMes = new Date(parseDataCivil(mes).getFullYear(), parseDataCivil(mes).getMonth() + 1, 0).getDate();
  const celulas = [...Array(primeiroDiaSemana).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)];
  const rotuloMes = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(parseDataCivil(mes));
  const hoje = hojeCivil();

  return (
    <div className="beauty-minical">
      <div className="beauty-minical-head">
        <button type="button" className="btn-ghost" onClick={() => onMudarMes(adicionarMeses(mes, -1))}>‹</button>
        <span>{rotuloMes.charAt(0).toUpperCase() + rotuloMes.slice(1)}</span>
        <button type="button" className="btn-ghost" onClick={() => onMudarMes(adicionarMeses(mes, 1))}>›</button>
      </div>
      <div className="beauty-minical-grid">
        {celulas.map((dia, i) => {
          if (!dia) return <span key={i} />;
          const civil = `${mes.slice(0, 8)}${String(dia).padStart(2, "0")}`;
          const ehSelecionado = civil === selecionado;
          const ehHoje = civil === hoje;
          return (
            <button
              type="button"
              key={i}
              className={"beauty-minical-day" + (ehSelecionado ? " selected" : "") + (ehHoje && !ehSelecionado ? " today" : "")}
              onClick={() => onSelecionar(civil)}
            >
              {dia}
            </button>
          );
        })}
      </div>
    </div>
  );
}
