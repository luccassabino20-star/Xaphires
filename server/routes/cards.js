import { Router } from "express";
import { requireAuth, requireBoardAccessParam } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import fs from "node:fs";
import Busboy from "busboy";
import * as repo from "../repo.js";
import { getCompany } from "../directory.js";
import { attachmentLimitFor } from "../plans.js";
import { runWithCompany } from "../context.js";

const router = Router();
router.use(requireAuth);
router.param("id", requireBoardAccessParam(repo.getBoardIdForCard));

router.patch(
  "/:id",
  ah(async (req, res) => {
    await repo.updateCard(req.params.id, req.body || {}, req.user.id);
    res.json({ ok: true });
  })
);

// Dedicado à descrição: diferente do PATCH genérico acima (otimista, grava no
// blur), este só existe porque o botão Salvar do editor no modal precisa da
// confirmação do servidor antes de aplicar a mudança no estado local (ver
// commitDescription em CardModal.jsx) - e é o único ponto que gera a entrada
// DESCRIPTION_CHANGED no feed.
router.patch(
  "/:id/description",
  ah(async (req, res) => {
    const { description } = req.body || {};
    if (typeof description !== "string") {
      return res.status(400).json({ error: "Descrição inválida", code: "INVALID_DESCRIPTION" });
    }
    await repo.updateCardDescription(req.params.id, description, req.user.id);
    res.json({ ok: true });
  })
);

router.get(
  "/:id/activities",
  ah(async (req, res) => {
    res.json({ activities: await repo.getCardActivities(req.params.id) });
  })
);

router.post(
  "/:id/comments",
  ah(async (req, res) => {
    const text = (req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Comentário vazio", code: "COMMENT_TEXT_REQUIRED" });
    const activity = await repo.addCardComment(req.params.id, req.user.id, text);
    res.status(201).json({ activity });
  })
);

// Achar o comentário e conferir que é mesmo um comentário deste cartão vale
// tanto pro PATCH quanto pro DELETE abaixo - id de atividade de outro cartão
// (ou de um action_type que não é comentário) não pode ser editado/excluído
// por aqui, mesmo que a pessoa tenha acesso de escrita ao cartão errado.
async function acharComentario(req, res) {
  const activity = await repo.getCardActivityById(req.params.activityId);
  if (!activity || activity.cardId !== req.params.id || activity.actionType !== "COMMENT_ADDED") {
    res.status(404).json({ error: "Comentário não encontrado", code: "COMMENT_NOT_FOUND" });
    return null;
  }
  return activity;
}

// Só o autor edita - diferente da exclusão (abaixo), abrir exceção pra dono do
// quadro/master aqui deixaria alguém reescrever palavras atribuídas a outra
// pessoa, que é bem mais grave que só apagar.
router.patch(
  "/:id/comments/:activityId",
  ah(async (req, res) => {
    const activity = await acharComentario(req, res);
    if (!activity) return;
    if (activity.userId !== req.user.id) {
      return res.status(403).json({ error: "Só quem escreveu pode editar o comentário", code: "FORBIDDEN_NOT_COMMENT_AUTHOR" });
    }
    const text = (req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Comentário vazio", code: "COMMENT_TEXT_REQUIRED" });
    const atualizado = await repo.updateCardComment(req.params.activityId, text);
    res.json({ activity: atualizado });
  })
);

router.delete(
  "/:id/comments/:activityId",
  ah(async (req, res) => {
    const activity = await acharComentario(req, res);
    if (!activity) return;
    // Mesma exceção do DELETE /api/cards/:id: dono do quadro (privado) ou
    // master da empresa modera comentário alheio; apagar não reescreve a
    // palavra de ninguém, só remove.
    const podeExcluir = activity.userId === req.user.id || req.boardRole === "owner" || req.user.role === "master";
    if (!podeExcluir) {
      return res.status(403).json({ error: "Só quem escreveu (ou o dono do quadro) pode excluir o comentário", code: "FORBIDDEN_NOT_COMMENT_AUTHOR" });
    }
    await repo.deleteCardComment(req.params.activityId);
    res.json({ ok: true });
  })
);

router.delete(
  "/:id",
  ah(async (req, res) => {
    // Só quem criou o cartão pode excluir, exceto dono do quadro (privado) ou
    // master da empresa - sem essa exceção, cartão de quem saiu da empresa
    // ficaria travado, sem ninguém que pudesse excluí-lo. Cartão sem criador
    // registrado (criado antes desta regra existir, ou gerado por rotina
    // automática) continua excluível por qualquer um com acesso de escrita,
    // como sempre foi - não há dono para checar contra.
    const card = await repo.getCardById(req.params.id);
    const podeExcluir =
      !card?.creatorId || card.creatorId === req.user.id || req.boardRole === "owner" || req.user.role === "master";
    if (!podeExcluir) {
      return res.status(403).json({ error: "Só quem criou o cartão pode excluí-lo", code: "FORBIDDEN_NOT_CARD_CREATOR" });
    }
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

// Upload em streaming: o arquivo é escrito no disco em pedaços, conforme chega,
// e nunca existe inteiro na memória. É isso que permite tetos altos sem o servidor
// consumir várias vezes o tamanho do arquivo por upload simultâneo.
//
// O limite é verificado DURANTE a transferência, não no fim: um arquivo grande
// demais é abortado no meio, em vez de ser recebido por completo para só então
// ser recusado.
router.post("/:id/attachments/file", (req, res) => {
  const limite = attachmentLimitFor(getCompany(req.companyId));
  const alvo = repo.newAttachmentTarget();

  let bb;
  try {
    bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: limite } });
  } catch {
    return res.status(400).json({ error: "Envio inválido", code: "INVALID_UPLOAD" });
  }

  let nomeArquivo = "";
  let tipo = "";
  let bytes = 0;
  let excedeu = false;
  let respondido = false;
  let saida = null;
  let descartar = false;

  // O arquivo parcial é apagado só depois que o stream fecha. No Windows, tentar
  // remover enquanto há escrita em voo falha silenciosamente e deixa lixo.
  function apagarQuandoPuder() {
    descartar = true;
    if (!saida || saida.destroyed) repo.discardAttachmentFile(alvo.path);
  }

  function falhar(status, body) {
    if (respondido) return;
    respondido = true;
    apagarQuandoPuder();
    req.unpipe(bb);
    res.status(status).json(body);
  }

  bb.on("file", (_campo, stream, info) => {
    nomeArquivo = (info.filename || "").trim();
    tipo = info.mimeType || "application/octet-stream";
    saida = fs.createWriteStream(alvo.path);

    // Destruir o stream no meio do pipe faz ele emitir 'error'. Sem listener isso
    // é uncaught e derruba o processo — foi o que aconteceu na primeira versão.
    saida.on("error", () => {
      falhar(500, { error: "Erro ao gravar o arquivo", code: "UPLOAD_FAILED" });
    });
    saida.on("close", () => {
      if (descartar) repo.discardAttachmentFile(alvo.path);
    });

    stream.on("data", (chunk) => {
      bytes += chunk.length;
    });
    // Emitido pelo busboy ao passar de limits.fileSize.
    stream.on("limit", () => {
      excedeu = true;
      stream.unpipe(saida);
      saida.end();
      falhar(400, {
        error: `Arquivo deve ter até ${Math.round(limite / 1024 / 1024)} MB`,
        code: "FILE_TOO_LARGE",
        maxBytes: limite,
      });
    });
    stream.on("error", () => falhar(400, { error: "Falha ao receber o arquivo", code: "UPLOAD_FAILED" }));
    stream.pipe(saida);
  });

  bb.on("error", () => falhar(400, { error: "Falha ao receber o arquivo", code: "UPLOAD_FAILED" }));

  // Os eventos do busboy são emitidos a partir do socket, que existe desde
  // antes do requireAuth entrar no contexto da empresa — o AsyncLocalStorage
  // não alcança aqui. Sem reentrar, getDb() não sabe qual banco abrir.
  //
  // O try/catch é essencial: uma exceção solta num handler de evento é
  // uncaught e derruba o processo inteiro, não só esta requisição.
  function registrar() {
    if (respondido || excedeu) return;
    try {
      const attachments = runWithCompany(req.companyId, () =>
        repo.registerFileAttachment(req.params.id, {
          id: alvo.id,
          name: nomeArquivo,
          mimeType: tipo,
          size: bytes,
        })
      );
      if (!attachments) return falhar(404, { error: "Cartão não encontrado", code: "CARD_NOT_FOUND" });
      respondido = true;
      res.status(201).json({ attachments });
    } catch (err) {
      console.error("Falha ao registrar anexo:", err);
      falhar(500, { error: "Erro ao salvar o anexo", code: "ATTACHMENT_SAVE_FAILED" });
    }
  }

  bb.on("close", () => {
    if (respondido || excedeu) return;
    if (!nomeArquivo || bytes === 0) {
      return falhar(400, { error: "Arquivo inválido", code: "FILE_REQUIRED" });
    }
    // O busboy fecha quando terminou de LER o corpo, mas a gravação em disco pode
    // ainda estar em voo. Responder aqui anunciava um anexo que um download
    // imediato podia pegar truncado — então espera o stream fechar de fato.
    if (saida && !saida.writableFinished) {
      saida.once("finish", registrar);
      return;
    }
    registrar();
  });

  // Cliente que desiste no meio (aba fechada, rede caiu) não deixa arquivo parcial
  // registrado como anexo válido nem lixo no disco.
  req.on("aborted", () => {
    if (respondido) return;
    respondido = true;
    // Nesta ordem: marcar o descarte primeiro, destruir depois. O unlink acontece
    // no 'close' do stream, quando o arquivo já não está mais aberto — no Windows,
    // remover com escrita em voo falha calado e deixa o arquivo lá.
    apagarQuandoPuder();
    req.unpipe(bb);
    saida?.destroy();
  });

  req.pipe(bb);
});

router.delete(
  "/:id/attachments/:attachmentId",
  ah(async (req, res) => {
    const attachments = await repo.removeAttachment(req.params.id, req.params.attachmentId);
    res.json({ attachments });
  })
);

// mimeType do anexo vem do Content-Type que o navegador de quem fez upload mandou -
// não é confiável, e ninguém valida contra nada no upload. Servir esse valor cru
// como Content-Type, "inline", deixa qualquer colega de empresa subir um arquivo
// com mimeType "text/html" e um payload de script, que roda na mesma origem do app
// quando outro usuário do quadro abre o link - furto de sessão sem tocar no cookie
// httpOnly. Só os tipos abaixo, que os navegadores não interpretam como HTML/script,
// são servidos inline; o resto força download (Content-Disposition: attachment).
const TIPOS_SEGUROS_PARA_INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

router.get(
  "/:id/attachments/:attachmentId/download",
  ah(async (req, res) => {
    const file = await repo.getAttachmentFile(req.params.id, req.params.attachmentId);
    if (!file) return res.status(404).json({ error: "Arquivo não encontrado", code: "ATTACHMENT_NOT_FOUND" });
    const safeName = String(file.name).replace(/[\r\n"]/g, "");
    const inline = TIPOS_SEGUROS_PARA_INLINE.has(file.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", inline ? file.mimeType : "application/octet-stream");
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${safeName}"`);
    res.sendFile(file.path);
  })
);

export { router };
