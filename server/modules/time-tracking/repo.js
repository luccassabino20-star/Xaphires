// Acesso ao banco do módulo Time & Tracking. Mesmo desenho dos outros
// módulos: tudo passa por getDb() (resolvido pelo AsyncLocalStorage do
// companyId), só funciona dentro de um runWithCompany, que requireAuth já
// garante nas rotas autenticadas.
import { getDb } from "../../db.js";
import { uid } from "../../repo.js";

function nowIso() {
  return new Date().toISOString();
}
// Dia civil local de quem está apontando - é o que a grade semanal soma, não
// a data UTC de start_time (podem divergir perto da meia-noite).
export function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseTags(raw) {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function serializeEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    taskId: row.task_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.duration_minutes,
    notes: row.notes,
    tags: parseTags(row.tags),
    billable: !!row.billable,
    hourlyRateCents: row.hourly_rate_cents,
    status: row.status,
    createdAt: row.created_at,
    taskName: row.task_name || null,
    projectName: row.project_name || null,
    userName: row.user_name || null,
  };
}

const SELECT_ENTRY = `
  SELECT e.*, t.name AS task_name, t.project_name, u.name AS user_name
    FROM tt_time_entries e
    LEFT JOIN tt_tasks t ON t.id = e.task_id
    LEFT JOIN users u ON u.id = e.user_id
`;

// ---------- Tarefas/Projetos ----------
export function listTasks() {
  return getDb().prepare("SELECT * FROM tt_tasks WHERE active = 1 ORDER BY project_name, name COLLATE NOCASE").all();
}
export function insertTask({ name, projectName }) {
  const id = uid();
  getDb()
    .prepare("INSERT INTO tt_tasks (id, name, project_name, created_at) VALUES (?, ?, ?, ?)")
    .run(id, name, projectName || "", nowIso());
  return getDb().prepare("SELECT * FROM tt_tasks WHERE id = ?").get(id);
}
export function deactivateTask(id) {
  getDb().prepare("UPDATE tt_tasks SET active = 0 WHERE id = ?").run(id);
}

// ---------- Apontamentos ----------
// end_time IS NULL sozinho não basta: um lançamento manual (sem cronômetro)
// também nasce com start_time/end_time ambos NULL, e não está "rodando". Só
// conta como cronômetro ativo quando HÁ um start_time real sem end_time.
export function getRunningEntry(userId) {
  return serializeEntry(getDb().prepare(`${SELECT_ENTRY} WHERE e.user_id = ? AND e.start_time IS NOT NULL AND e.end_time IS NULL`).get(userId));
}

// Uma cronometragem ativa por vez, por pessoa - evita dois cronômetros
// rodando ao mesmo tempo pro mesmo usuário (tempo se sobrepondo não faz
// sentido pra uma única pessoa).
export function startTimer({ taskId, notes, tags, billable, hourlyRateCents }, userId) {
  if (getRunningEntry(userId)) {
    const err = new Error("Já existe um cronômetro rodando");
    err.code = "TIMER_ALREADY_RUNNING";
    throw err;
  }
  const id = uid();
  const agora = nowIso();
  getDb()
    .prepare(
      `INSERT INTO tt_time_entries
         (id, user_id, task_id, date, start_time, end_time, duration_minutes, notes, tags, billable, hourly_rate_cents, status, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, 'draft', ?, ?)`
    )
    .run(id, userId, taskId || null, hojeCivil(), agora, notes || "", JSON.stringify(tags || []), billable ? 1 : 0, hourlyRateCents ?? null, agora, userId);
  return serializeEntry(getDb().prepare(`${SELECT_ENTRY} WHERE e.id = ?`).get(id));
}

export function stopTimer(entryId, userId) {
  const atual = getDb().prepare("SELECT * FROM tt_time_entries WHERE id = ? AND user_id = ?").get(entryId, userId);
  if (!atual || atual.end_time) return null;
  const fim = nowIso();
  const minutos = Math.max(0, Math.round((new Date(fim) - new Date(atual.start_time)) / 60000));
  getDb().prepare("UPDATE tt_time_entries SET end_time = ?, duration_minutes = ? WHERE id = ?").run(fim, minutos, entryId);
  return serializeEntry(getDb().prepare(`${SELECT_ENTRY} WHERE e.id = ?`).get(entryId));
}

// Lançamento manual (sem cronômetro) - duas formas de chegar na duração:
// (a) input inteligente já manda durationMinutes pronto ("1h 30m", "1.5"),
//     sem horário de início/fim - start_time/end_time ficam NULL;
// (b) intervalo explícito (startTime/endTime, "HH:MM" local do dia
//     escolhido) - aí a duração é CALCULADA aqui, ignorando durationMinutes
//     se vier junto, pra nunca gravar os dois de forma inconsistente.
export function insertManualEntry({ taskId, date, durationMinutes, startTime, endTime, notes, tags, billable, hourlyRateCents }, userId) {
  const id = uid();
  let inicio = null;
  let fim = null;
  let minutos = durationMinutes;
  if (startTime && endTime) {
    inicio = `${date}T${startTime}:00`;
    fim = `${date}T${endTime}:00`;
    minutos = Math.max(0, Math.round((new Date(fim) - new Date(inicio)) / 60000));
  }
  getDb()
    .prepare(
      `INSERT INTO tt_time_entries
         (id, user_id, task_id, date, start_time, end_time, duration_minutes, notes, tags, billable, hourly_rate_cents, status, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
    )
    .run(id, userId, taskId || null, date, inicio, fim, minutos, notes || "", JSON.stringify(tags || []), billable ? 1 : 0, hourlyRateCents ?? null, nowIso(), userId);
  return serializeEntry(getDb().prepare(`${SELECT_ENTRY} WHERE e.id = ?`).get(id));
}

export function updateEntry(id, userId, { taskId, date, durationMinutes, notes, tags, billable, hourlyRateCents }) {
  const atual = getDb().prepare("SELECT * FROM tt_time_entries WHERE id = ? AND user_id = ?").get(id, userId);
  if (!atual) return null;
  getDb()
    .prepare(
      `UPDATE tt_time_entries
          SET task_id = ?, date = ?, duration_minutes = ?, notes = ?, tags = ?, billable = ?, hourly_rate_cents = ?
        WHERE id = ?`
    )
    .run(
      taskId ?? atual.task_id,
      date ?? atual.date,
      durationMinutes ?? atual.duration_minutes,
      notes ?? atual.notes,
      tags ? JSON.stringify(tags) : atual.tags,
      billable === undefined ? atual.billable : billable ? 1 : 0,
      hourlyRateCents === undefined ? atual.hourly_rate_cents : hourlyRateCents,
      id
    );
  return serializeEntry(getDb().prepare(`${SELECT_ENTRY} WHERE e.id = ?`).get(id));
}

export function deleteEntry(id, userId) {
  getDb().prepare("DELETE FROM tt_time_entries WHERE id = ? AND user_id = ?").run(id, userId);
}

export function listEntriesForDay(userId, date) {
  return getDb().prepare(`${SELECT_ENTRY} WHERE e.user_id = ? AND e.date = ? ORDER BY e.start_time, e.created_at`).all(userId, date).map(serializeEntry);
}

export function listEntriesForRange(userId, from, to) {
  return getDb()
    .prepare(`${SELECT_ENTRY} WHERE e.user_id = ? AND e.date >= ? AND e.date <= ? ORDER BY e.date, e.created_at`)
    .all(userId, from, to)
    .map(serializeEntry);
}

// "Todos os apontamentos" (master) - mesma faixa, todo mundo da empresa.
export function listEntriesForRangeAllUsers(from, to) {
  return getDb()
    .prepare(`${SELECT_ENTRY} WHERE e.date >= ? AND e.date <= ? ORDER BY e.date, u.name COLLATE NOCASE`)
    .all(from, to)
    .map(serializeEntry);
}

// ---------- Timesheets (semana como unidade de aprovação) ----------
export function getOrCreateTimesheet(userId, startDate, endDate) {
  const existente = getDb().prepare("SELECT * FROM tt_timesheets WHERE user_id = ? AND start_date = ?").get(userId, startDate);
  if (existente) return existente;
  const id = uid();
  getDb()
    .prepare("INSERT INTO tt_timesheets (id, user_id, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, 'draft', ?)")
    .run(id, userId, startDate, endDate, nowIso());
  return getDb().prepare("SELECT * FROM tt_timesheets WHERE id = ?").get(id);
}
export function submitTimesheet(id, userId) {
  getDb()
    .prepare("UPDATE tt_timesheets SET status = 'submitted', submitted_at = ? WHERE id = ? AND user_id = ? AND status IN ('draft','rejected')")
    .run(nowIso(), id, userId);
  return getDb().prepare("SELECT * FROM tt_timesheets WHERE id = ?").get(id);
}
export function reviewTimesheet(id, decision, reviewerId) {
  getDb()
    .prepare("UPDATE tt_timesheets SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ? AND status = 'submitted'")
    .run(decision, nowIso(), reviewerId, id);
  return getDb().prepare("SELECT * FROM tt_timesheets WHERE id = ?").get(id);
}
export function listTimesheets(filtroStatus) {
  if (filtroStatus) {
    return getDb()
      .prepare("SELECT ts.*, u.name AS user_name FROM tt_timesheets ts JOIN users u ON u.id = ts.user_id WHERE ts.status = ? ORDER BY ts.start_date DESC")
      .all(filtroStatus);
  }
  return getDb()
    .prepare("SELECT ts.*, u.name AS user_name FROM tt_timesheets ts JOIN users u ON u.id = ts.user_id ORDER BY ts.start_date DESC")
    .all();
}
