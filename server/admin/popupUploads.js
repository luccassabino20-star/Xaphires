// Armazenamento da imagem do pop-up promocional. Fica fora de companies/<id>/uploads
// de propósito: não é anexo de cartão de uma empresa, é conteúdo de marketing da
// plataforma, servido publicamente para qualquer visitante da landing.
//
// Por ser público (ver a montagem de express.static em app.js), o nome do arquivo em
// disco carrega a extensão: sem ela o navegador não tem como adivinhar o
// Content-Type de uma URL estática, e a imagem não renderiza no <img>.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.KANBAN_DATA_DIR || path.join(process.cwd(), "server", "data");

const EXTENSAO_POR_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export function extensaoValida(mimeType) {
  return EXTENSAO_POR_MIME[mimeType] || null;
}

export function popupUploadsDir() {
  const dir = path.join(dataDir, "popup-uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// { path: caminho absoluto no disco, url: caminho público servido por express.static }
export function novoDestinoDeImagem(mimeType) {
  const extensao = extensaoValida(mimeType);
  const nome = crypto.randomUUID() + extensao;
  return { path: path.join(popupUploadsDir(), nome), url: `/uploads/popups/${nome}` };
}

// Some com o arquivo antigo ao trocar de imagem ou excluir a campanha. ENOENT
// (arquivo já não existe) não é erro aqui - o objetivo já estava cumprido.
export function apagarImagem(imageUrl) {
  if (!imageUrl) return;
  const nome = path.basename(imageUrl);
  try {
    fs.unlinkSync(path.join(popupUploadsDir(), nome));
  } catch {
    /* já não existia */
  }
}
