import { Router } from "express";
import { requireAuth, requireBoardAccess, requireBoardOwner } from "../middleware.js";
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

// Um quadro só. Existe para o acesso direto por id: quem não foi convidado leva
// 403 aqui em vez de descobrir o conteúdo, e é o que o cliente consulta quando
// alguém chega a um quadro que não está no workspace que ele carregou.
router.get(
  "/:id",
  requireBoardAccess((req) => req.params.id),
  ah(async (req, res) => {
    const board = (await repo.getWorkspace(req.user.id)).find((b) => b.id === req.params.id);
    if (!board) return res.status(404).json({ error: "Quadro não encontrado", code: "BOARD_NOT_FOUND" });
    res.json({ board });
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
    // No privado, ter acesso não é ser dono. Antes das permissões as duas coisas
    // eram a mesma, e a checagem de visibilidade acima bastava; agora um convidado
    // com direito de edição chegaria até aqui e apagaria o quadro de quem o convidou.
    if (access.visibility === "private" && req.boardRole !== "owner") {
      return res.status(403).json({ error: "Apenas o dono do quadro pode fazer isso", code: "FORBIDDEN_BOARD_OWNER_ONLY" });
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

// ---------- Compartilhamento de quadro privado ----------
const PAPEIS = new Set(["editor", "viewer"]);

// Ver quem tem acesso é permitido a quem já tem acesso: quem trabalha no quadro
// precisa saber com quem está trabalhando. Mudar a lista é só do dono.
router.get(
  "/:id/permissions",
  requireBoardAccess((req) => req.params.id),
  ah(async (req, res) => {
    if (req.boardAccess.visibility !== "private") {
      return res.status(400).json({ error: "Só quadros privados têm lista de acesso", code: "BOARD_NOT_PRIVATE" });
    }
    res.json({ permissions: await repo.listBoardPermissions(req.params.id), myRole: req.boardRole });
  })
);

// Adiciona alguém, ou troca o papel de quem já está na lista — é a mesma escrita.
router.post(
  "/:id/permissions",
  requireBoardAccess((req) => req.params.id),
  requireBoardOwner,
  ah(async (req, res) => {
    if (req.boardAccess.visibility !== "private") {
      return res.status(400).json({ error: "Só quadros privados têm lista de acesso", code: "BOARD_NOT_PRIVATE" });
    }
    const { userId, role } = req.body || {};
    if (!userId) return res.status(400).json({ error: "Usuário obrigatório", code: "USER_ID_REQUIRED" });
    if (!PAPEIS.has(role)) return res.status(400).json({ error: "Papel inválido", code: "INVALID_BOARD_ROLE" });
    // getUserById lê o banco da empresa em curso, então isto também é o que impede
    // conceder acesso ao usuário de outra empresa: lá o id simplesmente não existe.
    const alvo = await repo.getUserById(userId);
    if (!alvo) return res.status(404).json({ error: "Usuário não encontrado", code: "USER_NOT_FOUND" });
    // O dono já tem tudo, e rebaixá-lo a leitor o trancaria fora do próprio quadro.
    if (alvo.id === req.boardAccess.ownerId) {
      return res.status(400).json({ error: "O dono já tem acesso ao quadro", code: "CANNOT_CHANGE_BOARD_OWNER" });
    }
    await repo.grantBoardPermission(req.params.id, alvo.id, role);
    res.status(201).json({ permissions: await repo.listBoardPermissions(req.params.id) });
  })
);

router.delete(
  "/:id/permissions/:userId",
  requireBoardAccess((req) => req.params.id),
  requireBoardOwner,
  ah(async (req, res) => {
    await repo.revokeBoardPermission(req.params.id, req.params.userId);
    res.json({ permissions: await repo.listBoardPermissions(req.params.id) });
  })
);

export { router };
