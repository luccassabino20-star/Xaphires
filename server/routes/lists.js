import { Router } from "express";
import { requireAuth, requireBoardAccessParam } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import * as repo from "../repo.js";

const router = Router();
router.use(requireAuth);
router.param("id", requireBoardAccessParam(repo.getBoardIdForList));

router.patch(
  "/:id",
  ah(async (req, res) => {
    const { title, color } = req.body || {};
    if (title !== undefined) await repo.renameList(req.params.id, title.trim() || "Lista");
    if (color !== undefined) await repo.setListColor(req.params.id, color);
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
    await repo.clearListCards(req.params.id);
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
    await repo.setCardOrder(req.params.id, cardIds);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/cards",
  ah(async (req, res) => {
    const { id, title } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: "Título obrigatório", code: "TITLE_REQUIRED" });
    const cardId = await repo.createCard(req.params.id, { id, title: title.trim() });
    res.status(201).json({ id: cardId });
  })
);

export { router };
