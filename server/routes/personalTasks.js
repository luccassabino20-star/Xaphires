import { Router } from "express";
import { ah } from "../asyncHandler.js";
import * as repo from "../repo.js";
import { getCompany } from "../directory.js";
import { canUsePersonalPlanner } from "../plans.js";

const router = Router();

// O Planejador é recurso do Intermediário para cima. A leitura (e o excluir)
// ficam liberados para quem caiu de plano continuar vendo e podendo apagar o
// que já criou - mesmo padrão de recurrences.js.
function exigePlano(req, res, next) {
  if (canUsePersonalPlanner(getCompany(req.companyId)?.plan)) return next();
  return res.status(403).json({
    error: "O planejador pessoal está disponível a partir do plano Intermediário.",
    code: "PLAN_FEATURE_PERSONAL_PLANNER",
  });
}

// Sempre a agenda de quem está logado - não há id de usuário no corpo nem na
// URL para ninguém escolher tarefa de outra pessoa, e toda consulta já nasce
// filtrada por req.user.id.
function validar(body) {
  if (!body?.title?.trim()) return { error: "Título obrigatório", code: "TITLE_REQUIRED" };
  if (!body?.due || !/^\d{4}-\d{2}-\d{2}$/.test(body.due)) {
    return { error: "Escolha uma data", code: "DUE_REQUIRED" };
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
    const criada = repo.createPersonalTask(req.user.id, { title: req.body.title.trim(), due: req.body.due });
    res.status(201).json(criada);
  })
);

router.patch(
  "/:id",
  ownedOr404,
  exigePlano,
  ah(async (req, res) => {
    if (req.body?.title !== undefined || req.body?.due !== undefined) {
      const atual = repo.getPersonalTask(req.params.id);
      const erro = validar({ title: req.body.title ?? atual.title, due: req.body.due ?? atual.due });
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
