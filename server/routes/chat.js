import { Router } from "express";
import { ah } from "../asyncHandler.js";
import * as repo from "../repo.js";

const router = Router();

// conversationId chega por query (GET) ou corpo (POST/mark-read). Ausente = chat
// geral. Presente e a pessoa não é um dos dois participantes: 403, sem vazar nem
// a existência da conversa - a mensagem é a mesma de "não encontrada" seria.
function resolveConversation(req, res) {
  const conversationId =
    (typeof req.query.conversationId === "string" && req.query.conversationId) || req.body?.conversationId || null;
  if (!conversationId) return { conversationId: null, ok: true };
  if (!repo.isConversationParticipant(conversationId, req.user.id)) {
    res.status(403).json({ error: "Você não participa desta conversa", code: "FORBIDDEN_CHAT_CONVERSATION" });
    return { ok: false };
  }
  return { conversationId, ok: true };
}

router.get(
  "/conversations",
  ah(async (req, res) => {
    res.json(repo.listConversationsFor(req.user.id));
  })
);

// Cria (ou reaproveita, se já existir) a conversa direta com outro usuário da
// empresa. Não manda mensagem nenhuma - só garante que a conversa exista, para
// o cliente poder abrir a tela antes da primeira mensagem ser escrita.
router.post(
  "/conversations",
  ah(async (req, res) => {
    const otherUserId = req.body?.userId;
    if (!otherUserId || otherUserId === req.user.id) {
      return res.status(400).json({ error: "Selecione outro usuário", code: "CHAT_USER_REQUIRED" });
    }
    if (!(await repo.getUserById(otherUserId))) {
      return res.status(404).json({ error: "Usuário não encontrado", code: "CHAT_USER_NOT_FOUND" });
    }
    const id = repo.getOrCreateDirectConversation(req.user.id, otherUserId);
    res.status(201).json({ id });
  })
);

router.get(
  "/messages",
  ah(async (req, res) => {
    const resolved = resolveConversation(req, res);
    if (!resolved.ok) return;
    const afterId = typeof req.query.after === "string" ? req.query.after : undefined;
    res.json(repo.listChatMessages({ conversationId: resolved.conversationId, afterId }));
  })
);

router.post(
  "/messages",
  ah(async (req, res) => {
    const resolved = resolveConversation(req, res);
    if (!resolved.ok) return;
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) return res.status(400).json({ error: "Mensagem vazia", code: "CHAT_MESSAGE_REQUIRED" });
    if (body.length > repo.MAX_CHAT_BODY_LENGTH) {
      return res.status(400).json({ error: "Mensagem muito longa", code: "CHAT_MESSAGE_TOO_LONG" });
    }
    const message = repo.createChatMessage({ authorId: req.user.id, body, conversationId: resolved.conversationId });
    res.status(201).json(message);
  })
);

// Marca lido até uma mensagem específica (a última que o cliente tem na tela).
// Sem isso o contador de não lidas nunca voltaria a zero.
router.post(
  "/read",
  ah(async (req, res) => {
    const resolved = resolveConversation(req, res);
    if (!resolved.ok) return;
    const lastMessageId = typeof req.body?.lastMessageId === "string" ? req.body.lastMessageId : null;
    repo.markChatRead(req.user.id, resolved.conversationId, lastMessageId);
    res.json({ ok: true });
  })
);

export { router };
