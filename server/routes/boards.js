import { Router } from "express";
import { requireAuth, requireBoardAccess } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import * as repo from "../repo.js";
import { getCompany } from "../directory.js";
import { canUseAutoArchive, canUseRecurringCards } from "../plans.js";
import { varrerCobranca } from "../billing/lifecycle.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  ah(async (req, res) => {
    // A regra de arquivamento automático roda aqui, antes da leitura: assim o que
    // volta já está varrido e o cliente nunca mostra um cartão que deveria ter saído.
    // Empresa sem direito à automação não é varrida, mesmo que tenha a regra
    // gravada de quando estava num plano superior.
    const plano = getCompany(req.companyId)?.plan;
    if (canUseAutoArchive(plano)) {
      await repo.runAutoArchive();
    }
    // As rotinas geram antes da leitura pelo mesmo motivo: o quadro que volta já
    // contém os cartões do dia, sem exigir um segundo carregamento.
    if (canUseRecurringCards(plano)) {
      await repo.runRecurrences();
    }
    // Renovação, tentativa de cartão e carência. Aqui pelo mesmo motivo das duas
    // acima: o projeto não tem agendador, e abrir o quadro é o momento em que se
    // sabe que a empresa está viva. É idempotente e sai barato quando não há nada a
    // fazer. Nunca derruba a leitura: cobrança com problema não pode impedir alguém
    // de ver o próprio quadro.
    try {
      await varrerCobranca();
    } catch (err) {
      console.error("[billing] varredura falhou:", err.message);
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
    // typeof, e não !== undefined: com title: null o .trim() estourava e a rota
    // devolvia 500 no lugar de um 400 explicando o que estava errado.
    if (title !== undefined) {
      if (typeof title !== "string") return res.status(400).json({ error: "Título inválido", code: "INVALID_TITLE" });
      await repo.renameBoard(req.params.id, title.trim() || "Quadro");
    }
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
    await repo.setListOrder(req.params.boardId, orderedListIds);
    res.json({ ok: true });
  })
);

export { router };
