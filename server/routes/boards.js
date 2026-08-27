import { Router } from "express";
import fs from "node:fs";
import Busboy from "busboy";
import { requireAuth, requireBoardAccess, requireBoardOwner } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import * as repo from "../repo.js";
import { getCompany } from "../directory.js";
import { canUseAutoArchive, canUseRecurringCards, canAddBoard } from "../plans.js";
import { varrerCobranca } from "../billing/lifecycle.js";
import { runWithCompany } from "../context.js";

const router = Router();
router.use(requireAuth);

// Fixo, não é recurso de plano - mesmo espírito de AVATAR_MAX_BYTES em
// routes/profile.js. Mais generoso que o avatar (foto de fundo em tela cheia
// pede mais resolução que um círculo de 64px).
const BOARD_BACKGROUND_MAX_BYTES = 8 * 1024 * 1024;
const TIPOS_ACEITOS_FUNDO = new Set(["image/png", "image/jpeg", "image/webp"]);

// Mesma função de src/utils/backgrounds.js (withOverlay), duplicada em vez de
// importada: servidor não builda (ESM puro, ver CLAUDE.md) e src/ é território
// do cliente - preferível repetir 1 linha a acoplar as duas árvores.
function withOverlay(css) {
  return `linear-gradient(rgba(12,12,16,0.32), rgba(12,12,16,0.32)), ${css}`;
}

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
    const company = getCompany(req.companyId);
    if (!canAddBoard(company, repo.countBoards())) {
      return res.status(403).json({ error: "Limite de quadros do plano atingido", code: "BOARD_LIMIT_REACHED" });
    }
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
          error: "O arquivamento automático está disponível a partir do plano Pro.",
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

// Upload em streaming, mesmo desenho do avatar (ver o comentário grande em
// routes/profile.js POST /avatar): grava no disco aos poucos, conferindo o
// limite DURANTE a transferência, nunca com o arquivo inteiro em memória.
// requireBoardAccess já recusa leitor (403 fora daqui, papel só de leitura
// não escreve fundo) antes deste handler começar a ler o corpo.
router.post("/:id/background-image", requireBoardAccess((req) => req.params.id), (req, res) => {
  const boardId = req.params.id;
  const alvo = repo.newBoardBackgroundImageTarget();

  let bb;
  try {
    bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: BOARD_BACKGROUND_MAX_BYTES } });
  } catch {
    return res.status(400).json({ error: "Envio inválido", code: "INVALID_UPLOAD" });
  }

  let tipo = "";
  let bytes = 0;
  let excedeu = false;
  let tipoInvalido = false;
  let respondido = false;
  let saida = null;
  let descartar = false;

  // O arquivo parcial só é apagado depois que o stream fecha - no Windows,
  // remover enquanto há escrita em voo falha silenciosamente e deixa lixo.
  function apagarQuandoPuder() {
    descartar = true;
    if (!saida || saida.destroyed) repo.discardBoardBackgroundImageFile(alvo.path);
  }

  function falhar(status, body) {
    if (respondido) return;
    respondido = true;
    apagarQuandoPuder();
    req.unpipe(bb);
    res.status(status).json(body);
  }

  bb.on("file", (_campo, stream, info) => {
    tipo = info.mimeType || "";
    if (!TIPOS_ACEITOS_FUNDO.has(tipo)) {
      tipoInvalido = true;
      stream.resume(); // drena sem gravar - senão o upload trava esperando alguém ler
      return falhar(400, { error: "Envie uma imagem PNG, JPEG ou WEBP", code: "INVALID_BACKGROUND_IMAGE_TYPE" });
    }
    saida = fs.createWriteStream(alvo.path);

    saida.on("error", () => falhar(500, { error: "Erro ao gravar o arquivo", code: "UPLOAD_FAILED" }));
    saida.on("close", () => {
      if (descartar) repo.discardBoardBackgroundImageFile(alvo.path);
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
        error: `A imagem deve ter até ${Math.round(BOARD_BACKGROUND_MAX_BYTES / 1024 / 1024)} MB`,
        code: "BACKGROUND_IMAGE_TOO_LARGE",
        maxBytes: BOARD_BACKGROUND_MAX_BYTES,
      });
    });
    stream.on("error", () => falhar(400, { error: "Falha ao receber o arquivo", code: "UPLOAD_FAILED" }));
    stream.pipe(saida);
  });

  bb.on("error", () => falhar(400, { error: "Falha ao receber o arquivo", code: "UPLOAD_FAILED" }));

  // Os eventos do busboy nascem do socket, que existe desde antes do
  // requireAuth entrar no contexto da empresa - o AsyncLocalStorage não
  // alcança aqui. Sem reentrar, getDb() não sabe qual banco abrir.
  function registrar() {
    if (respondido || excedeu || tipoInvalido) return;
    try {
      const background = withOverlay(`url("/api/boards/${boardId}/background-image?v=${alvo.id}") center / cover no-repeat`);
      runWithCompany(req.companyId, () =>
        repo.setBoardBackgroundImage(boardId, { id: alvo.id, mimeType: tipo, background })
      );
      respondido = true;
      res.status(201).json({ background });
    } catch (err) {
      console.error("Falha ao salvar o fundo do quadro:", err);
      falhar(500, { error: "Erro ao salvar a imagem", code: "BACKGROUND_IMAGE_SAVE_FAILED" });
    }
  }

  bb.on("close", () => {
    if (respondido || excedeu || tipoInvalido) return;
    if (bytes === 0) return falhar(400, { error: "Arquivo inválido", code: "FILE_REQUIRED" });
    // O busboy fecha quando terminou de LER o corpo, mas a gravação em disco
    // pode ainda estar em voo - responder aqui anunciaria um fundo que uma
    // exibição imediata podia pegar truncado.
    if (saida && !saida.writableFinished) {
      saida.once("finish", registrar);
      return;
    }
    registrar();
  });

  // Cliente que desiste no meio (aba fechada, rede caiu) não deixa arquivo
  // parcial virando fundo de quadro nem lixo no disco.
  req.on("aborted", () => {
    if (respondido) return;
    respondido = true;
    apagarQuandoPuder();
    req.unpipe(bb);
    saida?.destroy();
  });

  req.pipe(bb);
});

// Servida como a foto de perfil (GET /api/profile/:id/avatar): rota autenticada
// com requireBoardAccess, não express.static - o fundo pode pertencer a um
// quadro privado, e um caminho estático não checaria isso. ?v= é o id da
// imagem (novo a cada troca), então cache longo é seguro.
router.get(
  "/:id/background-image",
  requireBoardAccess((req) => req.params.id),
  ah(async (req, res) => {
    const file = await repo.getBoardBackgroundImageFile(req.params.id);
    if (!file) return res.status(404).json({ error: "Imagem não encontrada", code: "BACKGROUND_IMAGE_NOT_FOUND" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.sendFile(file.path);
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
    // Mesma exceção do DELETE /api/cards/:id: dono do quadro privado ou master
    // da empresa limpa tudo, o resto só o que criou (ver clearBoard em repo.js).
    const podeExcluirTudo = req.boardRole === "owner" || req.user.role === "master";
    await repo.clearBoard(req.params.id, { userId: req.user.id, podeExcluirTudo });
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
