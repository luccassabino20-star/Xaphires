import { Router } from "express";
import fs from "node:fs";
import Busboy from "busboy";
import { requireAuth } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import * as repo from "../repo.js";
import { runWithCompany } from "../context.js";

const router = Router();
router.use(requireAuth);

// Fixo, não é recurso de plano - qualquer conta pode ter foto.
const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
const TIPOS_ACEITOS = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

router.patch(
  "/",
  ah(async (req, res) => {
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nome obrigatório", code: "NAME_REQUIRED" });
    const bio = typeof req.body?.bio === "string" ? req.body.bio : "";
    if (bio.length > repo.MAX_BIO_LENGTH) {
      return res.status(400).json({ error: `A descrição deve ter até ${repo.MAX_BIO_LENGTH} caracteres`, code: "BIO_TOO_LONG" });
    }
    const updated = repo.updateProfile(req.user.id, { name, bio });
    res.json(repo.publicUser(updated));
  })
);

// Preferências da Central de Perfil do Kanban (KanbanProfileModal.jsx):
// apelido, cor do badge, exibição padrão do quadro, avisos e cor de fundo
// sugerida para quadro novo. Allowlist explícita - impede gravar qualquer
// chave arbitrária no JSON (ver comentário de updateProfilePrefs em repo.js).
const CAMPOS_PREFS_VALIDOS = new Set([
  "nickname",
  "badgeColor",
  "defaultView",
  "notifyMention",
  "notifyAssignment",
  "notifyDeadline",
  "defaultBoardBackground",
]);
router.patch(
  "/prefs",
  ah(async (req, res) => {
    const corpo = req.body || {};
    const patch = {};
    for (const campo of CAMPOS_PREFS_VALIDOS) {
      if (campo in corpo) patch[campo] = corpo[campo];
    }
    const updated = repo.updateProfilePrefs(req.user.id, patch);
    res.json(repo.publicUser(updated));
  })
);

// Upload em streaming, mesmo desenho do anexo de cartão (ver o comentário
// grande em routes/cards.js: grava no disco aos poucos, conferindo o limite
// DURANTE a transferência, nunca com o arquivo inteiro em memória). Diferente
// de lá, não há id de destino no corpo - o alvo é sempre req.user.id, quem
// está logado; ninguém troca a foto de outra pessoa por aqui.
router.post("/avatar", (req, res) => {
  const alvo = repo.newAvatarTarget();

  let bb;
  try {
    bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: AVATAR_MAX_BYTES } });
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
    if (!saida || saida.destroyed) repo.discardAvatarFile(alvo.path);
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
    if (!TIPOS_ACEITOS.has(tipo)) {
      tipoInvalido = true;
      stream.resume(); // drena sem gravar - senão o upload trava esperando alguém ler
      return falhar(400, { error: "Envie uma imagem PNG, JPEG, WEBP ou GIF", code: "INVALID_IMAGE_TYPE" });
    }
    saida = fs.createWriteStream(alvo.path);

    saida.on("error", () => falhar(500, { error: "Erro ao gravar o arquivo", code: "UPLOAD_FAILED" }));
    saida.on("close", () => {
      if (descartar) repo.discardAvatarFile(alvo.path);
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
        error: `A foto deve ter até ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB`,
        code: "AVATAR_TOO_LARGE",
        maxBytes: AVATAR_MAX_BYTES,
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
      const updated = runWithCompany(req.companyId, () => repo.setUserAvatar(req.user.id, { id: alvo.id, mimeType: tipo }));
      respondido = true;
      res.status(201).json(repo.publicUser(updated));
    } catch (err) {
      console.error("Falha ao salvar a foto de perfil:", err);
      falhar(500, { error: "Erro ao salvar a foto", code: "AVATAR_SAVE_FAILED" });
    }
  }

  bb.on("close", () => {
    if (respondido || excedeu || tipoInvalido) return;
    if (bytes === 0) return falhar(400, { error: "Arquivo inválido", code: "FILE_REQUIRED" });
    // O busboy fecha quando terminou de LER o corpo, mas a gravação em disco
    // pode ainda estar em voo - responder aqui anunciaria uma foto que uma
    // exibição imediata podia pegar truncada.
    if (saida && !saida.writableFinished) {
      saida.once("finish", registrar);
      return;
    }
    registrar();
  });

  // Cliente que desiste no meio (aba fechada, rede caiu) não deixa arquivo
  // parcial virando foto de perfil nem lixo no disco.
  req.on("aborted", () => {
    if (respondido) return;
    respondido = true;
    apagarQuandoPuder();
    req.unpipe(bb);
    saida?.destroy();
  });

  req.pipe(bb);
});

router.delete(
  "/avatar",
  ah(async (req, res) => {
    const updated = repo.clearUserAvatar(req.user.id);
    res.json(repo.publicUser(updated));
  })
);

// Qualquer colega autenticado da mesma empresa pode ver a foto de qualquer
// outro - mesmo alcance de GET /api/users, que já lista todo mundo sem
// restrição por papel. Não há checagem extra de "é da minha empresa": getDb()
// já resolve sempre o banco da empresa de quem está logado (req.companyId,
// via requireAuth), então um id de usuário de outra empresa simplesmente não
// bate em getUserById ali dentro e cai no 404 sozinho.
router.get(
  "/:id/avatar",
  ah(async (req, res) => {
    const file = await repo.getAvatarFile(req.params.id);
    if (!file) return res.status(404).json({ error: "Foto não encontrada", code: "AVATAR_NOT_FOUND" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", file.mimeType);
    // O nome do arquivo (?v=) muda a cada troca, então cache longo é seguro -
    // ver o comentário em publicUser().
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.sendFile(file.path);
  })
);

export { router };
