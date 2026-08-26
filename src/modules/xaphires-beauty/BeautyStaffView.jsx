import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyEmptyState from "./BeautyEmptyState.jsx";
import BeautyIcon from "./BeautyIcon.jsx";

const VAZIO = { name: "", role: "", commissionPct: "0", color: "#E5417F" };
// Ordem de semana de trabalho (segunda primeiro, domingo por último) - mais
// natural pra cadastrar horário de salão do que a ordem 0=domingo do banco
// (mesma convenção de weekday que a recorrência do Kanban já usa).
const DIAS_EXIBICAO = [1, 2, 3, 4, 5, 6, 0];
function horariosVazios() {
  const h = {};
  for (let d = 0; d < 7; d++) h[d] = { ativo: false, startTime: "09:00", endTime: "18:00" };
  return h;
}

// Registro interno do profissional - sem conta de login própria (decisão
// confirmada com o cliente). commission_rate no banco é fração (0.2 = 20%);
// aqui no formulário é percentual inteiro, mais natural para digitar. Fase
// 8: cor (chip da agenda, Fase 9), especialidades (quais serviços a pessoa
// realiza - beauty_staff_services) e horário de trabalho por dia da semana
// (beauty_staff_hours) - só cadastro/exibição por ora, sem validar contra
// ele na hora de agendar ainda.
export default function BeautyStaffView({ canUse }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [equipe, setEquipe] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [especialidades, setEspecialidades] = useState(new Set());
  const [horarios, setHorarios] = useState(horariosVazios());
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    if (!canUse) return;
    try {
      const [eq, sv] = await Promise.all([api.xbGetStaff(), api.xbGetServices()]);
      setEquipe(eq);
      setServicos(sv);
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, [canUse]);

  async function editar(s) {
    setEditandoId(s.id);
    setF({ name: s.name, role: s.role || "", commissionPct: String(Math.round(s.commission_rate * 100)), color: s.color || "#E5417F" });
    try {
      const [ids, hrs] = await Promise.all([api.xbGetStaffServices(s.id), api.xbGetStaffHours(s.id)]);
      setEspecialidades(new Set(ids));
      const h = horariosVazios();
      for (const linha of hrs) h[linha.weekday] = { ativo: true, startTime: linha.start_time, endTime: linha.end_time };
      setHorarios(h);
    } catch (e) {
      showToast(translateError(e, t));
    }
  }
  function cancelar() {
    setEditandoId(null);
    setF(VAZIO);
    setEspecialidades(new Set());
    setHorarios(horariosVazios());
  }

  function alternarEspecialidade(id) {
    setEspecialidades((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }
  function atualizarHorario(dia, campo, valor) {
    setHorarios((atual) => ({ ...atual, [dia]: { ...atual[dia], [campo]: valor } }));
  }

  async function salvar(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    const commissionRate = Math.min(1, Math.max(0, (Number(f.commissionPct) || 0) / 100));
    setSalvando(true);
    try {
      const staff = editandoId
        ? await api.xbUpdateStaff(editandoId, { name: f.name, role: f.role, commissionRate, color: f.color })
        : await api.xbCreateStaff({ name: f.name, role: f.role, commissionRate, color: f.color });
      const horas = Object.entries(horarios)
        .filter(([, h]) => h.ativo)
        .map(([dia, h]) => ({ weekday: Number(dia), startTime: h.startTime, endTime: h.endTime }));
      await Promise.all([api.xbSetStaffServices(staff.id, [...especialidades]), api.xbSetStaffHours(staff.id, horas)]);
      showToast(t("modules.xaphiresBeauty.equipe.salvo"));
      cancelar();
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(s) {
    if (!window.confirm(t("modules.xaphiresBeauty.equipe.confirmarRemover", { nome: s.name }))) return;
    try {
      await api.xbDeleteStaff(s.id);
      showToast(t("modules.xaphiresBeauty.equipe.removido"));
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  if (!canUse) {
    return (
      <div>
        <div className="beauty-page-head">
          <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.equipe")}</h2>
        </div>
        <div className="beauty-card">
          <div className="beauty-lock-card">
            <BeautyIcon name="equipe" size={30} />
            <span>{t("modules.xaphiresBeauty.equipe.bloqueado", { plano: t("plan.names.intermediate") })}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="beauty-page-head">
        <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.equipe")}</h2>
      </div>

      <div className="beauty-card" style={{ marginBottom: 18, padding: 18 }}>
        <form className="beauty-form" onSubmit={salvar} style={{ marginBottom: 18 }}>
          <input type="text" placeholder={t("modules.xaphiresBeauty.equipe.nome")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
          <input type="text" placeholder={t("modules.xaphiresBeauty.equipe.cargo")} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
          <input
            type="number"
            min="0"
            max="100"
            placeholder={t("modules.xaphiresBeauty.equipe.comissao")}
            value={f.commissionPct}
            onChange={(e) => setF({ ...f, commissionPct: e.target.value })}
            style={{ maxWidth: 130 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.equipe.cor")}</span>
            <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} style={{ width: 40, height: 34, padding: 2 }} />
          </label>
          <button type="submit" className="btn-primary" disabled={salvando}>{editandoId ? t("common.save") : t("common.add")}</button>
          {editandoId && <button type="button" className="btn-ghost" onClick={cancelar}>{t("common.cancel")}</button>}
        </form>

        <h4 className="beauty-section-title" style={{ margin: "0 0 10px" }}>{t("modules.xaphiresBeauty.equipe.especialidades")}</h4>
        {servicos.length === 0 ? (
          <p className="beauty-cell-muted">{t("modules.xaphiresBeauty.servicos.vazio")}</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
            {servicos.map((s) => (
              <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={especialidades.has(s.id)} onChange={() => alternarEspecialidade(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        )}

        <h4 className="beauty-section-title" style={{ margin: "0 0 10px" }}>{t("modules.xaphiresBeauty.equipe.horarioTrabalho")}</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {DIAS_EXIBICAO.map((dia) => (
            <div key={dia} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 110 }}>
                <input type="checkbox" checked={horarios[dia].ativo} onChange={(e) => atualizarHorario(dia, "ativo", e.target.checked)} />
                {t(`modules.xaphiresBeauty.equipe.dias.${dia}`)}
              </label>
              {horarios[dia].ativo && (
                <>
                  <input type="time" value={horarios[dia].startTime} onChange={(e) => atualizarHorario(dia, "startTime", e.target.value)} />
                  <span className="beauty-cell-muted">{t("modules.xaphiresBeauty.equipe.ate")}</span>
                  <input type="time" value={horarios[dia].endTime} onChange={(e) => atualizarHorario(dia, "endTime", e.target.value)} />
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {erro && <div className="beauty-error">{erro}</div>}

      <div className="beauty-card">
        {equipe.length === 0 ? (
          <BeautyEmptyState title={t("modules.xaphiresBeauty.equipe.vazio")} />
        ) : (
          <div className="beauty-list">
            <div className="beauty-list-head">
              <span style={{ flex: 1.4 }}>{t("modules.xaphiresBeauty.equipe.nome")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.equipe.cargo")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.equipe.comissao")}</span>
            </div>
            {equipe.map((s) => (
              <div className="beauty-list-row" key={s.id}>
                <span className="beauty-cell-primary" style={{ flex: 1.4, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color || "#E5417F", flexShrink: 0 }} />
                  {s.name}
                </span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{s.role || "—"}</span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{Math.round(s.commission_rate * 100)}%</span>
                <span className="beauty-col-actions">
                  <button type="button" className="btn-ghost" onClick={() => editar(s)}>{t("financeiro.cad.editar")}</button>
                  <button type="button" className="btn-ghost" onClick={() => remover(s)}>{t("common.remove")}</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
