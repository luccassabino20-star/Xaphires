import { Router } from "express";
import { requireAuth, requireBoardAccessParam } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import * as repo from "../repo.js";
import { getCompany } from "../directory.js";
import { canUseBottleneckMonitor } from "../plans.js";

const router = Router();
router.use(requireAuth);
router.param("id", requireBoardAccessParam(repo.getBoardIdForList));

router.patch(
  "/:id",
  ah(async (req, res) => {
    const { title, color, stuckHours } = req.body || {};
    if (title !== undefined) {
      if (typeof title !== "string") return res.status(400).json({ error: "Título inválido", code: "INVALID_TITLE" });
      await repo.renameList(req.params.id, title.trim() || "Lista");
    }
    if (color !== undefined) await repo.setListColor(req.params.id, color);
    if (stuckHours !== undefined) {
      const h = stuckHours === null ? null : Number(stuckHours);
      // Desligar é sempre permitido, para uma coluna herdada de plano superior
      // não ficar monitorada sem como remover.
      if (h !== null && !canUseBottleneckMonitor(getCompany(req.companyId)?.plan)) {
        return res.status(403).json({
          error: "O monitor de gargalos está disponível a partir do plano Pro.",
          code: "PLAN_FEATURE_BOTTLENECK",
        });
      }
      if (h !== null && (!Number.isInteger(h) || h < 1 || h > 8760)) {
        return res.status(400).json({ error: "Horas deve ser entre 1 e 8760", code: "INVALID_STUCK_HOURS" });
      }
      await repo.setListStuckHours(req.params.id, h);
    }
    res.json({ ok: true });
  })
);

router.delete(
  "/:id",
  ah(async (req, res) => {
    await repo.deleteList(req.params.id);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/clear",
  ah(async (req, res) => {
    // Mesma exceção do DELETE /api/cards/:id: dono do quadro privado ou master
    // da empresa limpa tudo, o resto só o que criou (ver clearListCards em repo.js).
    const podeExcluirTudo = req.boardRole === "owner" || req.user.role === "master";
    await repo.clearListCards(req.params.id, { userId: req.user.id, podeExcluirTudo });
    res.json({ ok: true });
  })
);

router.post(
  "/:id/archive-completed",
  ah(async (req, res) => {
    const cardIds = await repo.archiveCompletedCards(req.params.id);
    res.json({ cardIds });
  })
);

router.put(
  "/:id/card-order",
  ah(async (req, res) => {
    const { cardIds } = req.body || {};
    if (!Array.isArray(cardIds)) return res.status(400).json({ error: "cardIds obrigatório", code: "CARD_IDS_REQUIRED" });
    await repo.setCardOrder(req.params.id, cardIds, req.user.id);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/cards",
  ah(async (req, res) => {
    const { id, title } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: "Título obrigatório", code: "TITLE_REQUIRED" });
    const cardId = await repo.createCard(req.params.id, { id, title: title.trim(), creatorId: req.user.id });
    res.status(201).json({ id: cardId });
  })
);

export { router };
