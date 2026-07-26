import { Router } from "express";
import { requireAuth, requireBoardAccess } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import * as repo from "../repo.js";
import { getCompany } from "../directory.js";
import { canUseAutoArchive } from "../plans.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  ah(async (req, res) => {
    // A regra de arquivamento automático roda aqui, antes da leitura: assim o que
    // volta já está varrido e o cliente nunca mostra um cartão que deveria ter saído.
    // Empresa sem direito à automação não é varrida, mesmo que tenha a regra
    // gravada de quando estava num plano superior.
    if (canUseAutoArchive(getCompany(req.companyId)?.plan)) {
      await repo.runAutoArchive();
    }
    res.json({ boards: await repo.getWorkspace(req.user.id) });
  })
);

router.post(
  "/",
  ah(async (req, res) => {
    const { id, title, visibility } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: "Título obrigatório", code: "TITLE_REQUIRED" });
    const boardId = await repo.createBoard({ id, title: title.trim(), ownerId: req.user.id, visibility });
    res.status(201).json({ id: boardId });
  })
);

router.patch(
  "/:id",
  requireBoardAccess((req) => req.params.id),
  ah(async (req, res) => {
    const { title, background, autoArchiveDays } = req.body || {};
    if (title !== undefined) await repo.renameBoard(req.params.id, title.trim() || "Quadro");
    if (background !== undefined) await repo.setBoardBackground(req.params.id, background);
    if (autoArchiveDays !== undefined) {
      const dias = autoArchiveDays === null ? null : Number(autoArchiveDays);
      // Desligar é sempre permitido: um plano que perdeu o direito precisa poder
      // remover a regra que já tinha, senão ela ficaria presa ligada.
      if (dias !== null && !canUseAutoArchive(getCompany(req.companyId)?.plan)) {
        return res.status(403).json({
          error: "O arquivamento automático está disponível a partir do plano Intermediário.",
          code: "PLAN_FEATURE_AUTO_ARCHIVE",
        });
      }
      if (dias !== null && (!Number.isInteger(dias) || dias < 1 || dias > 365)) {
        return res.status(400).json({ error: "Dias deve ser entre 1 e 365", code: "INVALID_AUTO_ARCHIVE_DAYS" });
      }
      await repo.setBoardAutoArchiveDays(req.params.id, dias);
    }
    res.json({ ok: true });
  })
);

router.delete(
  "/:id",
  requireBoardAccess((req) => req.params.id),
  ah(async (req, res) => {
    const access = await repo.getBoardAccessInfo(req.params.id);
    if (access.visibility !== "private" && req.user.role !== "master") {
      return res
        .status(403)
        .json({ error: "Apenas o usuário master pode excluir quadros compartilhados", code: "FORBIDDEN_DELETE_SHARED_BOARD" });
    }
    await repo.deleteBoard(req.params.id);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/clear",
  requireBoardAccess((req) => req.params.id),
  ah(async (req, res) => {
    await repo.clearBoard(req.params.id);
    res.json({ ok: true });
  })
);

router.post(
  "/:boardId/lists",
  requireBoardAccess((req) => req.params.boardId),
  ah(async (req, res) => {
    const { id, title } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: "Título obrigatório", code: "TITLE_REQUIRED" });
    const listId = await repo.createList(req.params.boardId, { id, title: title.trim() });
    res.status(201).json({ id: listId });
  })
);

router.put(
  "/:boardId/list-order",
  requireBoardAccess((req) => req.params.boardId),
  ah(async (req, res) => {
    const { orderedListIds } = req.body || {};
    if (!Array.isArray(orderedListIds))
      return res.status(400).json({ error: "orderedListIds obrigatório", code: "ORDERED_LIST_IDS_REQUIRED" });
    await repo.setListOrder(orderedListIds);
    res.json({ ok: true });
  })
);

export { router };
