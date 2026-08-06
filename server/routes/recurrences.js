import { Router } from "express";
import { requireAuth, requireBoardAccess, requireBoardAccessParam } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import * as repo from "../repo.js";
import { getCompany } from "../directory.js";
import { canUseRecurringCards } from "../plans.js";
import { FREQUENCIES } from "../recurrence.js";

const router = Router();
router.use(requireAuth);

// A recorrência é recurso do Profissional para cima. A leitura fica liberada para
// quem caiu de plano continuar vendo e podendo apagar o que já criou.
function exigePlano(req, res, next) {
  if (canUseRecurringCards(getCompany(req.companyId)?.plan)) return next();
  return res.status(403).json({
    error: "Os cartões recorrentes estão disponíveis a partir do plano Profissional.",
    code: "PLAN_FEATURE_RECURRING",
  });
}

function validar(body) {
  if (!body?.title?.trim()) return { error: "Título obrigatório", code: "TITLE_REQUIRED" };
  if (!body?.listId) return { error: "Escolha a coluna de destino", code: "LIST_REQUIRED" };
  if (!FREQUENCIES.includes(body.freq)) return { error: "Frequência inválida", code: "INVALID_FREQUENCY" };
  // A faixa importa: weekday: 99 passava como "inteiro" e a regra acabava gerando
  // num dia imprevisível, porque o cálculo do resto com número fora de 0-6 sai
  // negativo em JS.
  if (body.freq === "weekly" && !(Number.isInteger(body.weekday) && body.weekday >= 0 && body.weekday <= 6)) {
    return { error: "Escolha o dia da semana", code: "WEEKDAY_REQUIRED" };
  }
  if (body.freq === "monthly" && !(Number.isInteger(body.monthday) && body.monthday >= 1 && body.monthday <= 31)) {
    return { error: "Escolha um dia do mês entre 1 e 31", code: "MONTHDAY_REQUIRED" };
  }
  // monthday2 é opcional - só monthly usa, e só quando preenchido (null/undefined
  // pula a checagem, é o caso comum de um dia só).
  if (
    body.freq === "monthly" &&
    body.monthday2 !== undefined &&
    body.monthday2 !== null &&
    !(Number.isInteger(body.monthday2) && body.monthday2 >= 1 && body.monthday2 <= 31)
  ) {
    return { error: "Escolha um dia do mês entre 1 e 31", code: "MONTHDAY2_INVALID" };
  }
  if (body.hour !== undefined && body.hour !== null && !(Number.isInteger(body.hour) && body.hour >= 0 && body.hour <= 23)) {
    return { error: "Hora deve ser entre 0 e 23", code: "INVALID_HOUR" };
  }
  return null;
}

router.get(
  "/board/:boardId",
  requireBoardAccess((req) => req.params.boardId),
  ah(async (req, res) => {
    res.json({
      recurrences: await repo.listRecurrences(req.params.boardId),
      canUse: canUseRecurringCards(getCompany(req.companyId)?.plan),
    });
  })
);

router.post(
  "/board/:boardId",
  requireBoardAccess((req) => req.params.boardId),
  exigePlano,
  ah(async (req, res) => {
    const erro = validar(req.body);
    if (erro) return res.status(400).json(erro);
    // Precisa ser coluna DESTE quadro. Só checar a existência deixava uma regra
    // despejar cartões numa coluna de outro quadro, inclusive privado alheio.
    if (!(await repo.listBelongsToBoard(req.body.listId, req.params.boardId))) {
      return res.status(400).json({ error: "Coluna não encontrada neste quadro", code: "LIST_NOT_IN_BOARD" });
    }
    const criada = await repo.createRecurrence(req.params.boardId, { ...req.body, title: req.body.title.trim() });
    res.status(201).json(criada);
  })
);

router.param("id", requireBoardAccessParam(repo.getBoardIdForRecurrence));

router.patch(
  "/:id",
  exigePlano,
  ah(async (req, res) => {
    // Só ligar/desligar não passa pela validação completa: o corpo é parcial.
    if (Object.keys(req.body || {}).length > 1 || req.body?.active === undefined) {
      const erro = validar({ ...(await repo.getRecurrence(req.params.id)), ...req.body });
      if (erro) return res.status(400).json(erro);
    }
    // Trocar a coluna de destino passava sem conferência alguma no PATCH, o que
    // reabria pelo update o mesmo furo fechado na criação.
    if (req.body?.listId !== undefined) {
      const boardId = await repo.getBoardIdForRecurrence(req.params.id);
      if (!(await repo.listBelongsToBoard(req.body.listId, boardId))) {
        return res.status(400).json({ error: "Coluna não encontrada neste quadro", code: "LIST_NOT_IN_BOARD" });
      }
    }
    const atualizada = await repo.updateRecurrence(req.params.id, req.body || {});
    if (!atualizada) return res.status(404).json({ error: "Recorrência não encontrada", code: "RECURRENCE_NOT_FOUND" });
    res.json(atualizada);
  })
);

router.delete(
  "/:id",
  ah(async (req, res) => {
    await repo.deleteRecurrence(req.params.id);
    res.json({ ok: true });
  })
);

export { router };
