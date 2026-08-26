import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyEmptyState from "./BeautyEmptyState.jsx";

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function adicionarDias(civil, n) {
  const [y, m, d] = civil.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

const FORM_VAZIO = { staffId: "", date: hojeCivil(), startTime: "12:00", endTime: "13:00", reason: "" };

// "Bloqueio de horários" como item próprio do menu (redesenho): mesma API já
// usada dentro da Agenda (Fase 9) - aqui é só uma tela dedicada de
// cadastro/listagem dos próximos 30 dias, pra quem quer gerenciar bloqueios
// sem entrar na agenda do dia a dia.
export default function BeautyBlocksView() {
  const { t } = useTranslation();
  const showToast = useToast();
  const [equipe, setEquipe] = useState([]);
  const [blocos, setBlocos] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(FORM_VAZIO);

  async function carregar() {
    const from = `${hojeCivil()}T00:00:00`;
    const to = `${adicionarDias(hojeCivil(), 30)}T23:59:59`;
    try {
      const [eq, bl] = await Promise.all([api.xbGetStaff().catch(() => []), api.xbGetBlocks(from, to)]);
      setEquipe(eq);
      setBlocos(bl);
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  async function salvar(e) {
    e.preventDefault();
    if (!f.startTime || !f.endTime) return;
    try {
      await api.xbCreateBlock({ staffId: f.staffId || null, startsAt: `${f.date}T${f.startTime}:00`, endsAt: `${f.date}T${f.endTime}:00`, reason: f.reason });
      showToast(t("modules.xaphiresBeauty.agenda.bloqueioCriado"));
      setF(FORM_VAZIO);
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }
  async function remover(id) {
    if (!window.confirm(t("modules.xaphiresBeauty.agenda.confirmarRemoverBloqueio"))) return;
    try {
      await api.xbDeleteBlock(id);
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  return (
    <div>
      <div className="beauty-page-head">
        <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.bloqueioHorarios")}</h2>
      </div>

      <div className="beauty-card" style={{ marginBottom: 18 }}>
        <form className="beauty-form" onSubmit={salvar}>
          <select value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })}>
            <option value="">{t("modules.xaphiresBeauty.agenda.todaEquipe")}</option>
            {equipe.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
          <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.agenda.ate")}</span>
          <input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
          <input type="text" placeholder={t("modules.xaphiresBeauty.agenda.motivoBloqueio")} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          <button type="submit" className="btn-primary">{t("common.add")}</button>
        </form>
      </div>

      {erro && <div className="beauty-error">{erro}</div>}

      <div className="beauty-card">
        {blocos.length === 0 ? (
          <BeautyEmptyState title={t("modules.xaphiresBeauty.bloqueios.vazio")} />
        ) : (
          <div className="beauty-list">
            <div className="beauty-list-head">
              <span style={{ width: 90 }}>{t("modules.xaphiresBeauty.agenda.data")}</span>
              <span style={{ width: 130 }}>{t("modules.xaphiresBeauty.agenda.horario")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.agenda.motivoBloqueio")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.equipe.nome")}</span>
            </div>
            {blocos.map((b) => (
              <div className="beauty-list-row" key={b.id}>
                <span className="beauty-cell-muted" style={{ width: 90 }}>{b.starts_at.slice(0, 10)}</span>
                <span className="beauty-cell-primary" style={{ width: 130 }}>{b.starts_at.slice(11, 16)} - {b.ends_at.slice(11, 16)}</span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{b.reason || "—"}</span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{b.staff_name || t("modules.xaphiresBeauty.agenda.todaEquipe")}</span>
                <span className="beauty-col-actions">
                  <button type="button" className="btn-ghost" onClick={() => remover(b.id)}>{t("common.remove")}</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
