import { Router } from "express";
import { ah } from "../asyncHandler.js";
import * as repo from "../repo.js";
import { getCompany } from "../directory.js";
import { canUsePersonalPlanner } from "../plans.js";

const router = Router();

// O Planejador é recurso do Profissional para cima. A leitura (e o excluir)
// ficam liberados para quem caiu de plano continuar vendo e podendo apagar o
// que já criou - mesmo padrão de recurrences.js.
function exigePlano(req, res, next) {
  if (canUsePersonalPlanner(getCompany(req.companyId)?.plan)) return next();
  return res.status(403).json({
    error: "O planejador pessoal está disponível a partir do plano Pro.",
    code: "PLAN_FEATURE_PERSONAL_PLANNER",
  });
}

const PRIORITIES = ["low", "medium", "high"];
const TYPES = ["event", "task", "focus", "vacation"];
const COLORS = ["teal", "blue", "purple", "amber", "rose"];
const LABEL_MAX = 40;

// Sempre a agenda de quem está logado - não há id de usuário no corpo nem na
// URL para ninguém escolher tarefa de outra pessoa, e toda consulta já nasce
// filtrada por req.user.id.
function validar(body) {
  if (!body?.title?.trim()) return { error: "Título obrigatório", code: "TITLE_REQUIRED" };
  if (!body?.due || !/^\d{4}-\d{2}-\d{2}$/.test(body.due)) {
    return { error: "Escolha uma data", code: "DUE_REQUIRED" };
  }
  if (body.priority !== undefined && !PRIORITIES.includes(body.priority)) {
    return { error: "Prioridade inválida", code: "PRIORITY_INVALID" };
  }
  if (body.type !== undefined && !TYPES.includes(body.type)) {
    return { error: "Tipo inválido", code: "TYPE_INVALID" };
  }
  // startTime só é exigido quando o bloco tem horário (allDay:false) - a
  // grade semanal manda os dois juntos; o mês/lista não mandam nenhum dos
  // dois, e continuam "sem horário" (ver createPersonalTask/updatePersonalTask).
  if (body.startTime !== undefined && body.startTime !== null && !/^\d{2}:\d{2}$/.test(body.startTime)) {
    return { error: "Horário inválido", code: "START_TIME_INVALID" };
  }
  if (
    body.durationMin !== undefined &&
    body.durationMin !== null &&
    (!Number.isInteger(body.durationMin) || body.durationMin < 5 || body.durationMin > 1440)
  ) {
    return { error: "Duração inválida", code: "DURATION_INVALID" };
  }
  if (body.label !== undefined && body.label.length > LABEL_MAX) {
    return { error: "Etiqueta muito longa", code: "LABEL_TOO_LONG" };
  }
  if (body.color !== undefined && body.color !== null && !COLORS.includes(body.color)) {
    return { error: "Cor inválida", code: "COLOR_INVALID" };
  }
  return null;
}

// Id vindo de outro usuário não bate na consulta filtrada por user_id, então
// cai no 404 em vez de vazar a existência da tarefa alheia.
function ownedOr404(req, res, next) {
  const tarefa = repo.getPersonalTask(req.params.id);
  if (!tarefa || tarefa.userId !== req.user.id) {
    return res.status(404).json({ error: "Tarefa não encontrada", code: "PERSONAL_TASK_NOT_FOUND" });
  }
  next();
}

router.get(
  "/",
  ah(async (req, res) => {
    repo.runPersonalTaskAutoArchive(req.user.id);
    res.json({
      tasks: repo.listPersonalTasks(req.user.id),
      canUse: canUsePersonalPlanner(getCompany(req.companyId)?.plan),
    });
  })
);

router.post(
  "/",
  exigePlano,
  ah(async (req, res) => {
    const erro = validar(req.body);
    if (erro) return res.status(400).json(erro);
    const criada = repo.createPersonalTask(req.user.id, {
      title: req.body.title.trim(),
      due: req.body.due,
      priority: req.body.priority,
      type: req.body.type,
      allDay: req.body.allDay,
      startTime: req.body.startTime,
      durationMin: req.body.durationMin,
      label: req.body.label,
      color: req.body.color,
      tentative: req.body.tentative,
    });
    res.status(201).json(criada);
  })
);

router.patch(
  "/:id",
  ownedOr404,
  exigePlano,
  ah(async (req, res) => {
    const camposValidaveis = ["title", "due", "priority", "type", "startTime", "durationMin", "label", "color"];
    if (camposValidaveis.some((campo) => req.body?.[campo] !== undefined)) {
      const atual = repo.getPersonalTask(req.params.id);
      const erro = validar({
        title: req.body.title ?? atual.title,
        due: req.body.due ?? atual.due,
        priority: req.body.priority ?? atual.priority,
        type: req.body.type ?? atual.type,
        allDay: req.body.allDay,
        startTime: req.body.startTime !== undefined ? req.body.startTime : atual.startTime,
        durationMin: req.body.durationMin !== undefined ? req.body.durationMin : atual.durationMin,
        label: req.body.label ?? atual.label,
        color: req.body.color !== undefined ? req.body.color : atual.color,
      });
      if (erro) return res.status(400).json(erro);
    }
    const atualizada = repo.updatePersonalTask(req.params.id, req.body || {});
    res.json(atualizada);
  })
);

router.delete(
  "/:id",
  ownedOr404,
  ah(async (req, res) => {
    repo.deletePersonalTask(req.params.id);
    res.json({ ok: true });
  })
);

export { router };
