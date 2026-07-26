import { Router } from "express";
import { requireAuth, requireBoardAccessParam } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import * as repo from "../repo.js";

const router = Router();
router.use(requireAuth);
router.param("id", requireBoardAccessParam(repo.getBoardIdForCard));

router.patch(
  "/:id",
  ah(async (req, res) => {
    await repo.updateCard(req.params.id, req.body || {});
    res.json({ ok: true });
  })
);

router.delete(
  "/:id",
  ah(async (req, res) => {
    await repo.deleteCard(req.params.id);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/archive",
  ah(async (req, res) => {
    await repo.setCardArchived(req.params.id, true);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/unarchive",
  ah(async (req, res) => {
    await repo.setCardArchived(req.params.id, false);
    res.json({ ok: true });
  })
);

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

router.post(
  "/:id/attachments/link",
  ah(async (req, res) => {
    const { name, url } = req.body || {};
    const trimmedUrl = (url || "").trim();
    if (!trimmedUrl) return res.status(400).json({ error: "URL obrigatória", code: "URL_REQUIRED" });
    let parsed;
    try {
      parsed = new URL(trimmedUrl);
    } catch {
      parsed = null;
    }
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ error: "URL inválida", code: "INVALID_URL" });
    }
    const attachments = await repo.addLinkAttachment(req.params.id, {
      name: (name || "").trim() || trimmedUrl,
      url: trimmedUrl,
    });
    res.status(201).json({ attachments });
  })
);

router.post(
  "/:id/attachments/file",
  ah(async (req, res) => {
    const { name, mimeType, dataBase64 } = req.body || {};
    if (!name?.trim() || !dataBase64) return res.status(400).json({ error: "Arquivo inválido", code: "FILE_REQUIRED" });
    let buffer;
    try {
      buffer = Buffer.from(dataBase64, "base64");
    } catch {
      buffer = null;
    }
    if (!buffer || buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) {
      return res.status(400).json({ error: "Arquivo deve ter até 8MB", code: "FILE_TOO_LARGE" });
    }
    const attachments = await repo.addFileAttachment(req.params.id, { name: name.trim(), mimeType, buffer });
    res.status(201).json({ attachments });
  })
);

router.delete(
  "/:id/attachments/:attachmentId",
  ah(async (req, res) => {
    const attachments = await repo.removeAttachment(req.params.id, req.params.attachmentId);
    res.json({ attachments });
  })
);

router.get(
  "/:id/attachments/:attachmentId/download",
  ah(async (req, res) => {
    const file = await repo.getAttachmentFile(req.params.id, req.params.attachmentId);
    if (!file) return res.status(404).json({ error: "Arquivo não encontrado", code: "ATTACHMENT_NOT_FOUND" });
    const safeName = String(file.name).replace(/[\r\n"]/g, "");
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    res.sendFile(file.path);
  })
);

export { router };
