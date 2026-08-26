import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const FORM_VAZIO = { clientId: "", serviceId: "", staffId: "", time: "09:00", notes: "" };

// Agenda de um dia por vez - grade de horário fixa (como a de Saúde &
// Clínicas) seria overengineering para o volume de um salão pequeno neste
// momento do módulo; lista ordenada por horário já resolve. starts_at é
// sempre data/hora civil "ingênua" (sem Z) - a hora do relógio de quem
// agenda, nunca UTC (mesma convenção da Agenda de Saúde & Clínicas).
export default function BeautyAgendaView() {
  const { t } = useTranslation();
  const showToast = useToast();
  const [date, setDate] = useState(hojeCivil());
  const [agendamentos, setAgendamentos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(FORM_VAZIO);
  const [mostrarForm, setMostrarForm] = useState(false);

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
  async function carregarAgenda() {
    try {
      const lista = await api.xbGetAppointments(`${date}T00:00:00`, `${date}T23:59:59`);
      setAgendamentos(lista);
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
  }, [date]);

  async function salvar(e) {
    e.preventDefault();
    if (!f.clientId || !f.serviceId || !f.time) return;
    try {
      await api.xbCreateAppointment({
        clientId: f.clientId,
        serviceId: f.serviceId,
        staffId: f.staffId || null,
        startsAt: `${date}T${f.time}:00`,
        notes: f.notes,
      });
      showToast(t("modules.xaphiresBeauty.agenda.salvo"));
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

  return (
    <div className="sc-cad-secao">
      <div className="sc-form" style={{ alignItems: "center" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" className="btn-primary btn-small" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? t("common.cancel") : t("modules.xaphiresBeauty.agenda.novo")}
        </button>
      </div>

      {mostrarForm && (
        <form className="sc-form" onSubmit={salvar}>
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
          <input type="time" step={900} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          <input type="text" placeholder={t("modules.xaphiresBeauty.agenda.notas")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <button type="submit" className="btn-primary btn-small">{t("common.save")}</button>
        </form>
      )}

      {erro && <div className="sc-error">{erro}</div>}

      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("modules.xaphiresBeauty.agenda.horario")}</th>
              <th>{t("modules.xaphiresBeauty.agenda.colCliente")}</th>
              <th>{t("modules.xaphiresBeauty.agenda.colServico")}</th>
              <th>{t("modules.xaphiresBeauty.agenda.colProfissional")}</th>
              <th>{t("modules.xaphiresBeauty.agenda.situacao")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {agendamentos.length === 0 ? (
              <tr>
                <td colSpan={6} className="sc-empty">{t("modules.xaphiresBeauty.agenda.vazio")}</td>
              </tr>
            ) : (
              agendamentos.map((a) => (
                <tr key={a.id}>
                  <td>{a.starts_at.slice(11, 16)}</td>
                  <td>
                    {a.client_name}
                    {!!a.from_public_link && <span className="crm-tab-badge" style={{ marginLeft: 6 }}>{t("modules.xaphiresBeauty.agenda.online")}</span>}
                  </td>
                  <td>{a.service_name}</td>
                  <td>{a.staff_name || "-"}</td>
                  <td>{t(`modules.xaphiresBeauty.agenda.status.${a.status}`)}</td>
                  <td className="sc-row-actions">
                    {a.status === "agendado" && (
                      <>
                        <button type="button" className="btn-ghost btn-small" onClick={() => mudarStatus(a.id, "concluido")}>
                          {t("modules.xaphiresBeauty.agenda.concluir")}
                        </button>
                        <button type="button" className="btn-ghost btn-small" onClick={() => mudarStatus(a.id, "cancelado")}>
                          {t("modules.xaphiresBeauty.agenda.cancelar")}
                        </button>
                      </>
                    )}
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
