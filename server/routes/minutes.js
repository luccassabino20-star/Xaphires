import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import * as repo from "../repo.js";

const router = Router();
router.use(requireAuth);

async function canEdit(req, minuteId) {
  if (req.user.role === "master") return true;
  return (await repo.getMinuteAuthorId(minuteId)) === req.user.id;
}

router.get(
  "/",
  ah(async (req, res) => {
    res.json(await repo.listMinutes());
  })
);

router.post(
  "/",
  ah(async (req, res) => {
    const { title, date, attendeeIds, agenda, decisions, actionItems } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: "Título obrigatório", code: "TITLE_REQUIRED" });
    const id = await repo.createMinute({
      title: title.trim(),
      date: date || new Date().toISOString().slice(0, 10),
      authorId: req.user.id,
      attendeeIds,
      agenda,
      decisions,
      actionItems,
    });
    res.status(201).json(await repo.getMinuteById(id));
  })
);

router.patch(
  "/:id",
  ah(async (req, res) => {
    if (!(await repo.getMinuteById(req.params.id))) return res.status(404).json({ error: "Ata não encontrada", code: "MINUTE_NOT_FOUND" });
    if (!(await canEdit(req, req.params.id)))
      return res.status(403).json({ error: "Apenas o autor ou o usuário master pode editar esta ata", code: "FORBIDDEN_MINUTE_EDIT" });
    const { title, date, attendeeIds, agenda, decisions, actionItems } = req.body || {};
    if (title !== undefined && typeof title !== "string") {
      return res.status(400).json({ error: "Título inválido", code: "INVALID_TITLE" });
    }
    await repo.updateMinute(req.params.id, {
      title: title !== undefined ? title.trim() || "Sem título" : undefined,
      date,
      attendeeIds,
      agenda,
      decisions,
      actionItems,
    });
    res.json({ ok: true });
  })
);

router.delete(
  "/:id",
  ah(async (req, res) => {
    if (!(await repo.getMinuteById(req.params.id))) return res.status(404).json({ error: "Ata não encontrada", code: "MINUTE_NOT_FOUND" });
    if (!(await canEdit(req, req.params.id)))
      return res.status(403).json({ error: "Apenas o autor ou o usuário master pode excluir esta ata", code: "FORBIDDEN_MINUTE_DELETE" });
    await repo.deleteMinute(req.params.id);
    res.json({ ok: true });
  })
);

export { router };
