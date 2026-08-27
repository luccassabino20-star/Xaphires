import { Router } from "express";
import { requireAuth, requireWritablePlan, requireModule } from "../../middleware.js";
import { ah } from "../../asyncHandler.js";
import * as repo from "./repo.js";

const router = Router();
router.use(requireAuth, requireWritablePlan, requireModule("time-tracking"));

// Segunda-feira (civil) da semana que contém `dataCivil` - mesma convenção de
// início de semana já usada no Dashboard central (server/routes/dashboard.js).
function inicioDaSemana(dataCivil) {
  const [ano, mes, dia] = dataCivil.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia);
  const diaSemana = d.getDay();
  d.setDate(d.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
  return d;
}
function paraCivil(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fimDaSemana(inicio) {
  const d = new Date(inicio);
  d.setDate(d.getDate() + 6);
  return d;
}

// ---------- Tarefas/Projetos ----------
router.get("/tasks", ah(async (req, res) => res.json(repo.listTasks())));
router.post(
  "/tasks",
  ah(async (req, res) => {
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nome obrigatório", code: "NAME_REQUIRED" });
    res.json(repo.insertTask({ name, projectName: (req.body?.projectName || "").trim() }));
  })
);
router.delete("/tasks/:id", ah(async (req, res) => { repo.deactivateTask(req.params.id); res.json({ ok: true }); }));

// ---------- Cronômetro ----------
router.get("/entries/running", ah(async (req, res) => res.json(repo.getRunningEntry(req.user.id))));
router.post(
  "/entries/start",
  ah(async (req, res) => {
    try {
      res.json(repo.startTimer(req.body || {}, req.user.id));
    } catch (err) {
      if (err.code === "TIMER_ALREADY_RUNNING") return res.status(409).json({ error: err.message, code: err.code });
      throw err;
    }
  })
);
router.post(
  "/entries/:id/stop",
  ah(async (req, res) => {
    const parado = repo.stopTimer(req.params.id, req.user.id);
    if (!parado) return res.status(404).json({ error: "Apontamento não encontrado ou já parado", code: "ENTRY_NOT_RUNNING" });
    res.json(parado);
  })
);

// ---------- Apontamentos ----------
router.get("/entries/today", ah(async (req, res) => res.json(repo.listEntriesForDay(req.user.id, repo.hojeCivil()))));
router.post(
  "/entries",
  ah(async (req, res) => {
    const { taskId, date, durationMinutes, startTime, endTime, notes, tags, billable, hourlyRateCents } = req.body || {};
    const temIntervalo = startTime && endTime;
    if (!date || (!temIntervalo && (!Number.isFinite(durationMinutes) || durationMinutes <= 0))) {
      return res.status(400).json({ error: "Data e duração (ou início/fim) são obrigatórios", code: "ENTRY_INVALID" });
    }
    if (temIntervalo && endTime <= startTime) {
      return res.status(400).json({ error: "O horário final precisa ser depois do inicial", code: "ENTRY_INVALID_RANGE" });
    }
    res.json(repo.insertManualEntry({ taskId, date, durationMinutes, startTime, endTime, notes, tags, billable, hourlyRateCents }, req.user.id));
  })
);
router.patch(
  "/entries/:id",
  ah(async (req, res) => {
    const atualizado = repo.updateEntry(req.params.id, req.user.id, req.body || {});
    if (!atualizado) return res.status(404).json({ error: "Apontamento não encontrado", code: "ENTRY_NOT_FOUND" });
    res.json(atualizado);
  })
);
router.delete("/entries/:id", ah(async (req, res) => { repo.deleteEntry(req.params.id, req.user.id); res.json({ ok: true }); }));

// ---------- Grade semanal ----------
router.get(
  "/timesheets/weekly",
  ah(async (req, res) => {
    const inicio = inicioDaSemana(req.query.date || repo.hojeCivil());
    const fim = fimDaSemana(inicio);
    const startDate = paraCivil(inicio);
    const endDate = paraCivil(fim);
    const entries = repo.listEntriesForRange(req.user.id, startDate, endDate);
    const timesheet = repo.getOrCreateTimesheet(req.user.id, startDate, endDate);
    res.json({ startDate, endDate, entries, timesheet });
  })
);

// "Todos os apontamentos" - só master enxerga os apontamentos de todo mundo;
// membro comum cai no próprio (mesma regra que outras telas restritas do
// app: recusa genérica não é o caso aqui, é só um recorte de dado, não uma
// rota proibida).
router.get(
  "/timesheets/all",
  ah(async (req, res) => {
    const inicio = inicioDaSemana(req.query.date || repo.hojeCivil());
    const fim = fimDaSemana(inicio);
    const startDate = paraCivil(inicio);
    const endDate = paraCivil(fim);
    const entries =
      req.user.role === "master" ? repo.listEntriesForRangeAllUsers(startDate, endDate) : repo.listEntriesForRange(req.user.id, startDate, endDate);
    res.json({ startDate, endDate, entries });
  })
);

router.patch(
  "/timesheets/:id/submit",
  ah(async (req, res) => res.json(repo.submitTimesheet(req.params.id, req.user.id)))
);

// Aprovações: decisão é só do master - mesmo padrão de administração
// restrita ao papel já usado no resto do app (ver requireMaster em
// middleware.js), aplicado aqui na própria rota por ser só duas ações.
router.get(
  "/timesheets/approvals",
  ah(async (req, res) => {
    if (req.user.role !== "master") return res.status(403).json({ error: "Acesso restrito ao master", code: "FORBIDDEN_MASTER_ONLY" });
    res.json(repo.listTimesheets("submitted"));
  })
);
router.patch(
  "/timesheets/:id/approve",
  ah(async (req, res) => {
    if (req.user.role !== "master") return res.status(403).json({ error: "Acesso restrito ao master", code: "FORBIDDEN_MASTER_ONLY" });
    res.json(repo.reviewTimesheet(req.params.id, "approved", req.user.id));
  })
);
router.patch(
  "/timesheets/:id/reject",
  ah(async (req, res) => {
    if (req.user.role !== "master") return res.status(403).json({ error: "Acesso restrito ao master", code: "FORBIDDEN_MASTER_ONLY" });
    res.json(repo.reviewTimesheet(req.params.id, "rejected", req.user.id));
  })
);

export { router };
