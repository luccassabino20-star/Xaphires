import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyEmptyState from "./BeautyEmptyState.jsx";

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

const FORM_VAZIO = { clientId: "", serviceId: "", staffId: "", date: hojeCivil(), time: "09:00", notes: "", repeatFrequency: "none", repeatOccurrences: "4" };
const BLOCK_VAZIO = { staffId: "", date: hojeCivil(), startTime: "12:00", endTime: "13:00", reason: "" };
const BADGE_POR_STATUS = { agendado: "beauty-badge-agendado", concluido: "beauty-badge-concluido", cancelado: "beauty-badge-cancelado" };

// Agenda (Fase 9): visão Dia (lista, como sempre foi) e visão Semana (7
// colunas), com filtro por profissional nas duas. starts_at é sempre
// data/hora civil "ingênua" (sem Z) - a hora do relógio de quem agenda,
// nunca UTC (mesma convenção desde a Fase 0). "Repetir" gera N ocorrências
// de uma vez na criação (sem motor de recorrência automática, não é o
// runRecurrences() do quadro Kanban); "Duplicar" só pré-preenche o
// formulário com os dados de um agendamento existente, sem tocar em nada
// até o usuário confirmar salvar.
export default function BeautyAgendaView() {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [visao, setVisao] = useState("dia"); // dia | semana
  const [date, setDate] = useState(hojeCivil());
  const [filtroStaff, setFiltroStaff] = useState("");
  const [agendamentos, setAgendamentos] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(FORM_VAZIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [fBlock, setFBlock] = useState(BLOCK_VAZIO);
  const [mostrarBlockForm, setMostrarBlockForm] = useState(false);

  async function carregarBase() {
    try {
      const [c, s, eq] = await Promise.all([api.xbGetClients(), api.xbGetServices(), api.xbGetStaff().catch(() => [])]);
      setClientes(c);
      setServicos(s);
      setEquipe(eq);
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

  function itensDoDia(dia) {
    const ags = agendamentos
      .filter((a) => a.starts_at.slice(0, 10) === dia)
      .filter((a) => !filtroStaff || a.staff_id === filtroStaff)
      .map((a) => ({ tipo: "agendamento", horario: a.starts_at.slice(11, 16), dado: a }));
    const bls = bloqueios
      .filter((b) => b.starts_at.slice(0, 10) === dia)
      .filter((b) => !filtroStaff || !b.staff_id || b.staff_id === filtroStaff)
      .map((b) => ({ tipo: "bloqueio", horario: b.starts_at.slice(11, 16), dado: b }));
    return [...ags, ...bls].sort((x, y) => x.horario.localeCompare(y.horario));
  }

  function abrirNovo(diaPreset) {
    setF({ ...FORM_VAZIO, date: diaPreset || date });
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

  const itensDoDiaAtual = visao === "dia" ? itensDoDia(date) : [];

  return (
    <div>
      <div className="beauty-page-head">
        <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.agenda")}</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="beauty-view-toggle">
            <button type="button" className={visao === "dia" ? "active" : ""} onClick={() => setVisao("dia")}>{t("modules.xaphiresBeauty.agenda.visaoDia")}</button>
            <button type="button" className={visao === "semana" ? "active" : ""} onClick={() => setVisao("semana")}>{t("modules.xaphiresBeauty.agenda.visaoSemana")}</button>
          </div>
          {visao === "dia" ? (
            <input className="beauty-date-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" className="btn-ghost" onClick={() => setDate(adicionarDias(date, -7))}>‹</button>
              <span className="beauty-cell-muted">{formatarDiaCurto(segunda, i18n.language)} - {formatarDiaCurto(adicionarDias(segunda, 6), i18n.language)}</span>
              <button type="button" className="btn-ghost" onClick={() => setDate(adicionarDias(date, 7))}>›</button>
            </div>
          )}
          <select value={filtroStaff} onChange={(e) => setFiltroStaff(e.target.value)}>
            <option value="">{t("modules.xaphiresBeauty.agenda.todosProfissionais")}</option>
            {equipe.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={() => setMostrarBlockForm((v) => !v)}>
            {mostrarBlockForm ? t("common.cancel") : t("modules.xaphiresBeauty.agenda.novoBloqueio")}
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
        <div className="beauty-card">
          {itensDoDiaAtual.length === 0 ? (
            <BeautyEmptyState title={t("modules.xaphiresBeauty.agenda.vazio")} text={t("modules.xaphiresBeauty.agenda.vazioDica")} />
          ) : (
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
          )}
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
    </div>
  );
}
