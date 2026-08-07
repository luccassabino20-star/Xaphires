import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, companiesDir } from "./db.js";
import { getCurrentCompanyId } from "./context.js";
import { shouldGenerate, lastDueOccurrence, dueDateFor } from "./recurrence.js";

export function uid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

// ---------- Users ----------
export function countUsers() {
  return getDb().prepare("SELECT COUNT(*) as c FROM users").get().c;
}
export function getUserById(id) {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
}
export function getUserByEmail(email) {
  return getDb().prepare("SELECT * FROM users WHERE email = ?").get((email || "").toLowerCase()) || null;
}
export function listUsers() {
  return getDb().prepare("SELECT * FROM users ORDER BY created_at ASC").all();
}
export function insertUser({ id, name, email, passwordHash, role }) {
  const userId = id || uid();
  getDb().prepare(
    "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(userId, name, email.toLowerCase(), passwordHash, role, nowIso());
  return getUserById(userId);
}
export function updateUser(id, { name, email }) {
  const user = getUserById(id);
  if (!user) return null;
  getDb().prepare("UPDATE users SET name = ?, email = ? WHERE id = ?").run(
    name ?? user.name,
    (email ?? user.email).toLowerCase(),
    id
  );
  return getUserById(id);
}
export function setPassword(id, passwordHash) {
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
}
export function setUserRole(id, role) {
  getDb().prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
  return getUserById(id);
}
export function deleteUser(id) {
  // Sem isto a foto de perfil de quem foi excluído ficava órfã em
  // companies/<id>/uploads/avatars para sempre - a linha do usuário some
  // (nada de ON DELETE aqui, é arquivo, não outra tabela).
  const atual = getUserById(id);
  if (atual?.avatar_path) {
    try {
      fs.unlinkSync(path.join(avatarsUploadsDir(), atual.avatar_path));
    } catch {
      /* já pode ter sumido */
    }
  }
  getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
}
export function deletePrivateBoardsByOwner(userId) {
  const ids = getDb()
    .prepare("SELECT id FROM boards WHERE owner_id = ? AND visibility = 'private'")
    .all(userId)
    .map((r) => r.id);
  removeAttachmentFilesOf(cardIdsOfBoards(ids));
  getDb().prepare("DELETE FROM boards WHERE owner_id = ? AND visibility = 'private'").run(userId);
}
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    bio: u.bio || "",
    // ?v=avatar_path muda a cada troca de foto (o path é um uuid novo), então
    // o navegador busca de novo sozinho - sem isso a mesma URL por usuário
    // ficaria presa no cache com a foto antiga depois de trocar.
    avatarUrl: u.avatar_path ? `/api/profile/${u.id}/avatar?v=${u.avatar_path}` : null,
    createdAt: u.created_at,
  };
}

// Espelhado no cliente (state/api.js) para o textarea recusar digitar além
// disso, mas a autoridade continua sendo esta checagem no servidor.
export const MAX_BIO_LENGTH = 280;

export function updateProfile(userId, { name, bio }) {
  const atual = getUserById(userId);
  if (!atual) return null;
  getDb()
    .prepare("UPDATE users SET name = ?, bio = ? WHERE id = ?")
    .run(name ?? atual.name, bio === undefined ? atual.bio || "" : bio, userId);
  return getUserById(userId);
}

function avatarsUploadsDir() {
  const dir = path.join(companiesDir(), getCurrentCompanyId(), "uploads", "avatars");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Caminho de destino para uma foto em streaming - mesmo raciocínio do
// newAttachmentTarget de cartão: o id nasce antes porque o arquivo começa a
// ser escrito enquanto ainda está chegando.
export function newAvatarTarget() {
  const id = uid();
  return { id, path: path.join(avatarsUploadsDir(), id) };
}

// Troca a foto (já gravada em disco por newAvatarTarget) e apaga a anterior,
// se havia uma - sem isso, cada troca deixava a foto velha órfã no disco para
// sempre, do mesmo jeito que um anexo removido sem o unlink correspondente.
export function setUserAvatar(userId, { id, mimeType }) {
  const atual = getUserById(userId);
  getDb().prepare("UPDATE users SET avatar_path = ?, avatar_mime = ? WHERE id = ?").run(id, mimeType, userId);
  if (atual?.avatar_path) {
    try {
      fs.unlinkSync(path.join(avatarsUploadsDir(), atual.avatar_path));
    } catch {
      /* já pode ter sumido */
    }
  }
  return getUserById(userId);
}

export function clearUserAvatar(userId) {
  const atual = getUserById(userId);
  if (atual?.avatar_path) {
    try {
      fs.unlinkSync(path.join(avatarsUploadsDir(), atual.avatar_path));
    } catch {
      /* já pode ter sumido */
    }
  }
  getDb().prepare("UPDATE users SET avatar_path = NULL, avatar_mime = NULL WHERE id = ?").run(userId);
  return getUserById(userId);
}

export function getAvatarFile(userId) {
  const u = getUserById(userId);
  if (!u?.avatar_path) return null;
  const filePath = path.join(avatarsUploadsDir(), u.avatar_path);
  if (!fs.existsSync(filePath)) return null;
  return { path: filePath, mimeType: u.avatar_mime || "application/octet-stream" };
}

export function discardAvatarFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* já pode ter sumido */
  }
}

export function scrubUserFromCards(userId) {
  const rows = getDb().prepare("SELECT id, member_ids FROM cards").all();
  const stmt = getDb().prepare("UPDATE cards SET member_ids = ? WHERE id = ?");
  for (const row of rows) {
    let ids;
    try {
      ids = JSON.parse(row.member_ids);
    } catch {
      ids = [];
    }
    if (ids.includes(userId)) {
      stmt.run(JSON.stringify(ids.filter((x) => x !== userId)), row.id);
    }
  }
}

// ---------- Boards / Lists / Cards ----------
function nextPosition(table, whereCol, whereVal) {
  const row =
    whereVal === undefined
      ? getDb().prepare(`SELECT COALESCE(MAX(position), -1) as m FROM ${table}`).get()
      : getDb().prepare(`SELECT COALESCE(MAX(position), -1) as m FROM ${table} WHERE ${whereCol} = ?`).get(whereVal);
  return row.m + 1;
}

export function countBoards() {
  return getDb().prepare("SELECT COUNT(*) as c FROM boards").get().c;
}
export function createBoard({ id, title, ownerId, visibility }) {
  const boardId = id || uid();
  const pos = nextPosition("boards");
  const vis = visibility === "private" ? "private" : "shared";
  getDb().prepare(
    "INSERT INTO boards (id, title, owner_id, visibility, position, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(boardId, title, ownerId || null, vis, pos, nowIso());
  if (vis === "private" && ownerId) registrarDono(boardId, ownerId);
  return boardId;
}
export function renameBoard(id, title) {
  getDb().prepare("UPDATE boards SET title = ? WHERE id = ?").run(title, id);
}
export function setBoardBackground(id, background) {
  getDb().prepare("UPDATE boards SET background = ? WHERE id = ?").run(background || null, id);
}
export function deleteBoard(id) {
  removeAttachmentFilesOf(cardIdsOfBoards([id]));
  getDb().prepare("DELETE FROM boards WHERE id = ?").run(id);
}
export function clearBoard(id) {
  removeAttachmentFilesOf(cardIdsOfBoards([id]));
  getDb().prepare("DELETE FROM lists WHERE board_id = ?").run(id);
}
export function getBoardAccessInfo(boardId) {
  const row = getDb().prepare("SELECT owner_id, visibility FROM boards WHERE id = ?").get(boardId);
  if (!row) return null;
  // O mapa de convidados só é consultado no quadro privado: é a única visibilidade
  // em que ele decide alguma coisa, e esta função roda em toda requisição que toca
  // cartão, lista ou recorrência.
  const roles = new Map();
  if (row.visibility === "private") {
    for (const p of getDb().prepare("SELECT user_id, role FROM board_permissions WHERE board_id = ?").all(boardId)) {
      roles.set(p.user_id, p.role);
    }
  }
  return { boardId, ownerId: row.owner_id, visibility: row.visibility, roles };
}

// ---------- Permissões de quadro privado ----------
// O dono entra na tabela junto com o quadro. Não é o que autoriza o dono (isso é
// boards.owner_id), é o que faz a lista de acesso sair completa numa consulta só.
function registrarDono(boardId, ownerId) {
  getDb()
    .prepare(
      `INSERT INTO board_permissions (board_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)
       ON CONFLICT(board_id, user_id) DO UPDATE SET role = 'owner'`
    )
    .run(boardId, ownerId, nowIso());
}

// Lista quem tem acesso, já com nome e e-mail: o modal mostra pessoas, não ids.
export function listBoardPermissions(boardId) {
  return getDb()
    .prepare(
      `SELECT p.user_id, p.role, p.created_at, u.name, u.email, u.avatar_path
         FROM board_permissions p JOIN users u ON u.id = p.user_id
        WHERE p.board_id = ?
        ORDER BY CASE p.role WHEN 'owner' THEN 0 ELSE 1 END, u.name COLLATE NOCASE ASC`
    )
    .all(boardId)
    .map((r) => ({
      userId: r.user_id,
      role: r.role,
      name: r.name,
      email: r.email,
      avatarUrl: r.avatar_path ? `/api/profile/${r.user_id}/avatar?v=${r.avatar_path}` : null,
      createdAt: r.created_at,
    }));
}

// Conceder é idempotente e serve também para trocar o papel de quem já está na
// lista: o modal usa o mesmo caminho para adicionar e para alternar leitura/edição.
export function grantBoardPermission(boardId, userId, role) {
  getDb()
    .prepare(
      `INSERT INTO board_permissions (board_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(board_id, user_id) DO UPDATE SET role = excluded.role`
    )
    .run(boardId, userId, role, nowIso());
}

// O dono nunca sai por aqui — quem quiser tirá-lo do quadro exclui o quadro. Sem
// esta guarda, um erro de digitação no id deixaria um quadro privado sem ninguém
// que pudesse administrá-lo.
export function revokeBoardPermission(boardId, userId) {
  getDb().prepare("DELETE FROM board_permissions WHERE board_id = ? AND user_id = ? AND role <> 'owner'").run(boardId, userId);
}

export function getBoardPermission(boardId, userId) {
  const row = getDb().prepare("SELECT role FROM board_permissions WHERE board_id = ? AND user_id = ?").get(boardId, userId);
  return row ? row.role : null;
}
export function getBoardIdForList(listId) {
  const row = getDb().prepare("SELECT board_id FROM lists WHERE id = ?").get(listId);
  return row ? row.board_id : null;
}
export function getBoardIdForCard(cardId) {
  const row = getDb()
    .prepare("SELECT l.board_id as board_id FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ?")
    .get(cardId);
  return row ? row.board_id : null;
}
export function boardExists(id) {
  return !!getDb().prepare("SELECT 1 FROM boards WHERE id = ?").get(id);
}

export function createList(boardId, { id, title }) {
  const listId = id || uid();
  const pos = nextPosition("lists", "board_id", boardId);
  getDb().prepare("INSERT INTO lists (id, board_id, title, position) VALUES (?, ?, ?, ?)").run(listId, boardId, title, pos);
  return listId;
}
export function renameList(id, title) {
  getDb().prepare("UPDATE lists SET title = ? WHERE id = ?").run(title, id);
}
export function setListColor(id, color) {
  getDb().prepare("UPDATE lists SET color = ? WHERE id = ?").run(color || null, id);
}
export function deleteList(id) {
  removeAttachmentFilesOf(cardIdsOfList(id));
  getDb().prepare("DELETE FROM lists WHERE id = ?").run(id);
}
// Só reordena listas do próprio quadro. Sem o filtro por board_id, um id de lista
// de outro quadro no corpo da requisição teria a position reescrita, mesmo em
// quadro privado a que o autor não tem acesso.
export function setListOrder(boardId, orderedListIds) {
  const doQuadro = new Set(
    getDb().prepare("SELECT id FROM lists WHERE board_id = ?").all(boardId).map((r) => r.id)
  );
  const stmt = getDb().prepare("UPDATE lists SET position = ? WHERE id = ?");
  orderedListIds.filter((id) => doQuadro.has(id)).forEach((id, idx) => stmt.run(idx, id));
}
export function clearListCards(listId) {
  // Preserva os arquivados: o reducer do cliente só apaga o que está em cardIds,
  // e arquivado não está lá. Sem o filtro, limpar a coluna apagaria no servidor
  // um histórico que continuaria aparecendo na tela até o próximo carregamento.
  removeAttachmentFilesOf(cardIdsOfList(listId, { incluirArquivados: false }));
  getDb().prepare("DELETE FROM cards WHERE list_id = ? AND archived = 0").run(listId);
}
export function listExists(id) {
  return !!getDb().prepare("SELECT 1 FROM lists WHERE id = ?").get(id);
}

export function createCard(listId, { id, title, creatorId }) {
  const cardId = id || uid();
  const pos = nextPosition("cards", "list_id", listId);
  // list_entered_at nasce preenchido: sem isso o cartão fica com NULL e o monitor
  // de gargalos nunca o enxerga, porque hoursStuck() devolve null para NULL. Era
  // justamente o cartão criado e esquecido numa coluna que passava batido.
  // created_at e list_entered_at nascem com a mesma marca: no instante da criação o
  // cartão acabou de entrar na primeira coluna, e gerar dois nowIso() diferentes só
  // criaria uma diferença de milissegundos para alguém estranhar depois no relatório.
  const agora = nowIso();
  getDb().prepare(
    "INSERT INTO cards (id, list_id, title, description, labels, due, checklist, subtasks, member_ids, position, list_entered_at, created_at, creator_id) VALUES (?, ?, ?, '', '[]', NULL, '[]', '[]', '[]', ?, ?, ?, ?)"
  ).run(cardId, listId, title, pos, agora, agora, creatorId || null);
  return cardId;
}
export function deleteCard(id) {
  removeAttachmentFilesOf([id]);
  getDb().prepare("DELETE FROM cards WHERE id = ?").run(id);
}

// ---------- Arquivamento de cartões ----------
// Arquivar não move nem apaga: list_id e position ficam intactos, então restaurar
// devolve o cartão à coluna e à posição de origem. O que muda é a leitura do quadro,
// que deixa de incluir o id em list.cardIds.
export function setCardArchived(id, archived) {
  getDb()
    .prepare("UPDATE cards SET archived = ?, archived_at = ? WHERE id = ?")
    .run(archived ? 1 : 0, archived ? nowIso() : null, id);
}

export function setBoardAutoArchiveDays(boardId, days) {
  const valor = Number.isInteger(days) && days > 0 ? days : null;
  getDb().prepare("UPDATE boards SET auto_archive_days = ? WHERE id = ?").run(valor, boardId);
}

// Varre os quadros com a regra ligada e arquiva os concluídos que passaram do prazo.
// Roda na leitura do workspace: sem agendador, e o resultado é sempre coerente com
// o que o usuário está prestes a ver. Retorna quantos foram arquivados.
export function runAutoArchive() {
  const boards = getDb()
    .prepare("SELECT id, auto_archive_days FROM boards WHERE auto_archive_days IS NOT NULL AND auto_archive_days > 0")
    .all();
  if (boards.length === 0) return 0;

  const at = nowIso();
  let total = 0;
  const stmt = getDb().prepare(`
    UPDATE cards SET archived = 1, archived_at = ?
    WHERE archived = 0
      AND completed = 1
      AND completed_at IS NOT NULL
      AND completed_at <= ?
      AND list_id IN (SELECT id FROM lists WHERE board_id = ?)
  `);
  for (const b of boards) {
    const limite = new Date(Date.now() - b.auto_archive_days * 86400000).toISOString();
    const r = stmt.run(at, limite, b.id);
    total += Number(r.changes || 0);
  }
  return total;
}

// Arquiva os cartões concluídos e ainda não arquivados de uma coluna.
// Retorna os ids afetados para o cliente saber o que sumiu sem precisar recarregar.
export function archiveCompletedCards(listId) {
  const rows = getDb()
    .prepare("SELECT id FROM cards WHERE list_id = ? AND completed = 1 AND archived = 0")
    .all(listId);
  const stmt = getDb().prepare("UPDATE cards SET archived = 1, archived_at = ? WHERE id = ?");
  const at = nowIso();
  rows.forEach((r) => stmt.run(at, r.id));
  return rows.map((r) => r.id);
}
export function updateCard(id, patch) {
  const row = getDb().prepare("SELECT * FROM cards WHERE id = ?").get(id);
  if (!row) return;
  const next = {
    title: patch.title ?? row.title,
    description: patch.description ?? row.description,
    labels: patch.labels ? JSON.stringify(patch.labels) : row.labels,
    due: patch.due !== undefined ? patch.due : row.due,
    start_date: patch.startDate !== undefined ? patch.startDate : row.start_date,
    location: patch.location !== undefined ? (patch.location ? JSON.stringify(patch.location) : null) : row.location,
    checklist: patch.checklist ? JSON.stringify(patch.checklist) : row.checklist,
    subtasks: patch.subtasks ? JSON.stringify(patch.subtasks) : row.subtasks,
    member_ids: patch.memberIds ? JSON.stringify(patch.memberIds) : row.member_ids,
    completed: patch.completed !== undefined ? (patch.completed ? 1 : 0) : row.completed,
    urgent: patch.urgent !== undefined ? (patch.urgent ? 1 : 0) : row.urgent,
    important: patch.important !== undefined ? (patch.important ? 1 : 0) : row.important,
  };
  // A data de conclusão acompanha a transição: marcar grava agora, desmarcar limpa
  // (assim reconcluir reinicia a contagem). Se completed não veio no patch, preserva.
  let completedAt = row.completed_at;
  if (patch.completed !== undefined) {
    const virouConcluido = !!patch.completed;
    if (virouConcluido && !row.completed) completedAt = nowIso();
    else if (!virouConcluido) completedAt = null;
  }
  getDb().prepare(
    "UPDATE cards SET title=?, description=?, labels=?, due=?, start_date=?, location=?, checklist=?, subtasks=?, member_ids=?, completed=?, urgent=?, important=?, completed_at=? WHERE id=?"
  ).run(
    next.title,
    next.description,
    next.labels,
    next.due,
    next.start_date,
    next.location,
    next.checklist,
    next.subtasks,
    next.member_ids,
    next.completed,
    next.urgent,
    next.important,
    completedAt,
    id
  );
}
export function setCardOrder(listId, cardIds) {
  // Só aceita cartões que já pertencem ao quadro da lista de destino.
  //
  // A rota autoriza o acesso à lista de destino, mas os ids no corpo vinham sem
  // conferência nenhuma — e este UPDATE reescreve list_id. Um id de cartão de outro
  // quadro, inclusive privado de outra pessoa, era puxado para dentro da lista e
  // passava a ser legível. Filtrar aqui, e não na rota, protege todos os chamadores
  // de uma vez.
  const boardId = getBoardIdForList(listId);
  if (!boardId) return;
  const doQuadro = new Set(cardIdsOfBoards([boardId]));

  // O relógio do gargalo só reinicia quando o cartão TROCA de coluna. Reordenar
  // dentro da mesma lista chama esta função também, e zerar ali deixaria qualquer
  // arrastão esconder um gargalo real.
  const atual = getDb().prepare("SELECT id, list_id FROM cards WHERE id = ?");
  const stmt = getDb().prepare("UPDATE cards SET list_id = ?, position = ? WHERE id = ?");
  const marcaEntrada = getDb().prepare("UPDATE cards SET list_entered_at = ? WHERE id = ?");
  const agora = nowIso();
  cardIds
    .filter((id) => doQuadro.has(id))
    .forEach((id, idx) => {
      const antes = atual.get(id);
      stmt.run(listId, idx, id);
      if (antes && antes.list_id !== listId) marcaEntrada.run(agora, id);
    });
}

// A lista pertence a este quadro? Usado para impedir que uma regra de recorrência
// de um quadro despeje cartões numa coluna de outro.
export function listBelongsToBoard(listId, boardId) {
  return !!getDb().prepare("SELECT 1 FROM lists WHERE id = ? AND board_id = ?").get(listId, boardId);
}

export function setListStuckHours(listId, hours) {
  const valor = Number.isInteger(hours) && hours > 0 ? hours : null;
  getDb().prepare("UPDATE lists SET stuck_hours = ? WHERE id = ?").run(valor, listId);
}

// ---------- Card attachments ----------
function attachmentsUploadsDir() {
  const dir = path.join(companiesDir(), getCurrentCompanyId(), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function parseAttachments(row) {
  try {
    return JSON.parse(row?.attachments || "[]");
  } catch {
    return [];
  }
}

// Apaga do disco os arquivos anexados a estes cartões.
//
// A linha do cartão desaparece por ON DELETE CASCADE quando a lista ou o quadro é
// apagado, mas o arquivo no disco não tem cascade nenhum. Sem varrer ANTES de
// deletar as linhas, todo excluir/limpar deixava os uploads órfãos para sempre em
// companies/<id>/uploads, sem nada que os recolhesse depois.
function removeAttachmentFilesOf(cardIds) {
  if (!cardIds || cardIds.length === 0) return;
  const marcadores = cardIds.map(() => "?").join(",");
  const rows = getDb().prepare(`SELECT attachments FROM cards WHERE id IN (${marcadores})`).all(...cardIds);
  let dir = null;
  for (const row of rows) {
    for (const anexo of parseAttachments(row)) {
      // Link não tem arquivo; anexo sem id não tem como ser localizado.
      if (anexo?.type !== "file" || !anexo.id) continue;
      dir ||= attachmentsUploadsDir();
      try {
        fs.unlinkSync(path.join(dir, anexo.id));
      } catch {
        /* já pode ter sumido */
      }
    }
  }
}

function cardIdsOfList(listId, { incluirArquivados = true } = {}) {
  const sql = incluirArquivados
    ? "SELECT id FROM cards WHERE list_id = ?"
    : "SELECT id FROM cards WHERE list_id = ? AND archived = 0";
  return getDb().prepare(sql).all(listId).map((r) => r.id);
}

function cardIdsOfBoards(boardIds) {
  if (!boardIds || boardIds.length === 0) return [];
  const marcadores = boardIds.map(() => "?").join(",");
  return getDb()
    .prepare(`SELECT id FROM cards WHERE list_id IN (SELECT id FROM lists WHERE board_id IN (${marcadores}))`)
    .all(...boardIds)
    .map((r) => r.id);
}
export function addLinkAttachment(cardId, { name, url }) {
  const row = getDb().prepare("SELECT attachments FROM cards WHERE id = ?").get(cardId);
  if (!row) return null;
  const attachments = parseAttachments(row);
  attachments.push({ id: uid(), type: "link", name, url, mimeType: null, size: null, addedAt: nowIso() });
  getDb().prepare("UPDATE cards SET attachments = ? WHERE id = ?").run(JSON.stringify(attachments), cardId);
  return attachments;
}
export function addFileAttachment(cardId, { name, mimeType, buffer }) {
  const row = getDb().prepare("SELECT attachments FROM cards WHERE id = ?").get(cardId);
  if (!row) return null;
  const attachments = parseAttachments(row);
  const id = uid();
  fs.writeFileSync(path.join(attachmentsUploadsDir(), id), buffer);
  attachments.push({
    id,
    type: "file",
    name,
    url: null,
    mimeType: mimeType || "application/octet-stream",
    size: buffer.length,
    addedAt: nowIso(),
  });
  getDb().prepare("UPDATE cards SET attachments = ? WHERE id = ?").run(JSON.stringify(attachments), cardId);
  return attachments;
}
export function removeAttachment(cardId, attachmentId) {
  const row = getDb().prepare("SELECT attachments FROM cards WHERE id = ?").get(cardId);
  if (!row) return null;
  const attachments = parseAttachments(row);
  const target = attachments.find((a) => a.id === attachmentId);
  const remaining = attachments.filter((a) => a.id !== attachmentId);
  if (target?.type === "file") {
    try {
      fs.unlinkSync(path.join(attachmentsUploadsDir(), target.id));
    } catch {
      /* already gone */
    }
  }
  getDb().prepare("UPDATE cards SET attachments = ? WHERE id = ?").run(JSON.stringify(remaining), cardId);
  return remaining;
}
export function getAttachmentFile(cardId, attachmentId) {
  const row = getDb().prepare("SELECT attachments FROM cards WHERE id = ?").get(cardId);
  if (!row) return null;
  const attachment = parseAttachments(row).find((a) => a.id === attachmentId && a.type === "file");
  if (!attachment) return null;
  const filePath = path.join(attachmentsUploadsDir(), attachment.id);
  if (!fs.existsSync(filePath)) return null;
  return { path: filePath, name: attachment.name, mimeType: attachment.mimeType };
}

// ---------- Chat (geral da empresa + conversas privadas) ----------
// O geral é sem quadro nem canal, mesmo alcance de quem vê o quadro compartilhado.
// Conversas privadas são sempre a dois. MAX_CHAT_BODY_LENGTH espelha o limite
// validado em routes/chat.js.
export const MAX_CHAT_BODY_LENGTH = 2000;
const CHAT_HISTORY_LIMIT = 200;
// Chave de chat_reads para o geral - texto estável, nunca colide com um id de
// conversa (uid() gera UUID, não essa palavra).
const GENERAL_CHAT_KEY = "general";

function publicChatMessage(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    conversationId: row.conversation_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

function chatScope(conversationId) {
  return conversationId ? { clause: "conversation_id = ?", params: [conversationId] } : { clause: "conversation_id IS NULL", params: [] };
}

// O cursor de paginação é o rowid implícito da tabela, não created_at: duas
// mensagens no mesmo milissegundo (poll rápido, dois usuários digitando juntos)
// empatariam no timestamp, e ">" estrito faria uma delas sumir do próximo poll.
// rowid nunca empata, porque cresce por inserção. Não há rota de exclusão de
// mensagem — se um dia existir, um afterId apagado passa a devolver lista vazia
// para sempre, e este comentário é o aviso de que o cursor precisa mudar junto.
export function listChatMessages({ conversationId, afterId } = {}) {
  const db = getDb();
  const { clause, params } = chatScope(conversationId);
  if (afterId) {
    return db
      .prepare(
        `SELECT * FROM chat_messages WHERE ${clause} AND rowid > (SELECT rowid FROM chat_messages WHERE id = ?) ORDER BY rowid ASC`
      )
      .all(...params, afterId)
      .map(publicChatMessage);
  }
  const rows = db
    .prepare(`SELECT * FROM chat_messages WHERE ${clause} ORDER BY rowid DESC LIMIT ?`)
    .all(...params, CHAT_HISTORY_LIMIT);
  return rows.reverse().map(publicChatMessage);
}

export function createChatMessage({ authorId, body, conversationId }) {
  const id = uid();
  const createdAt = nowIso();
  getDb()
    .prepare("INSERT INTO chat_messages (id, author_id, conversation_id, body, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, authorId || null, conversationId || null, body, createdAt);
  return publicChatMessage({
    id,
    author_id: authorId || null,
    conversation_id: conversationId || null,
    body,
    created_at: createdAt,
  });
}

// user_a_id < user_b_id sempre, para "A conversando com B" e "B conversando com A"
// caírem na mesma linha em vez de criar duas conversas para o mesmo par.
function normalizedPair(userId, otherUserId) {
  return userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];
}

export function getOrCreateDirectConversation(userId, otherUserId) {
  const db = getDb();
  const [a, b] = normalizedPair(userId, otherUserId);
  const existing = db.prepare("SELECT id FROM chat_conversations WHERE user_a_id = ? AND user_b_id = ?").get(a, b);
  if (existing) return existing.id;
  const id = uid();
  db.prepare("INSERT INTO chat_conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)").run(id, a, b, nowIso());
  return id;
}

function getConversationById(id) {
  return getDb().prepare("SELECT * FROM chat_conversations WHERE id = ?").get(id) || null;
}

// Autorização de leitura/escrita de uma conversa privada: só quem é um dos dois
// participantes. Chamado pela rota antes de qualquer GET/POST com conversationId.
export function isConversationParticipant(conversationId, userId) {
  const c = getConversationById(conversationId);
  return !!c && (c.user_a_id === userId || c.user_b_id === userId);
}

function chatKeyFor(conversationId) {
  return conversationId || GENERAL_CHAT_KEY;
}

export function markChatRead(userId, conversationId, lastMessageId) {
  getDb()
    .prepare(
      `INSERT INTO chat_reads (user_id, conversation_key, last_read_message_id, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, conversation_key)
       DO UPDATE SET last_read_message_id = excluded.last_read_message_id, updated_at = excluded.updated_at`
    )
    .run(userId, chatKeyFor(conversationId), lastMessageId || null, nowIso());
}

function unreadCountFor(db, userId, conversationId) {
  const { clause, params } = chatScope(conversationId);
  const read = db
    .prepare("SELECT last_read_message_id FROM chat_reads WHERE user_id = ? AND conversation_key = ?")
    .get(userId, chatKeyFor(conversationId));
  if (!read?.last_read_message_id) {
    return db.prepare(`SELECT COUNT(*) c FROM chat_messages WHERE ${clause}`).get(...params).c;
  }
  return db
    .prepare(`SELECT COUNT(*) c FROM chat_messages WHERE ${clause} AND rowid > (SELECT rowid FROM chat_messages WHERE id = ?)`)
    .get(...params, read.last_read_message_id).c;
}

function lastMessageFor(db, conversationId) {
  const { clause, params } = chatScope(conversationId);
  const row = db.prepare(`SELECT * FROM chat_messages WHERE ${clause} ORDER BY rowid DESC LIMIT 1`).get(...params);
  return row ? publicChatMessage(row) : null;
}

// Lista as conversas do usuário para a barra lateral do chat: o geral sempre entra,
// em seguida as privadas em que ele é um dos dois participantes. O geral fica
// fixo no topo (como um canal fixo); as privadas vêm ordenadas pela mensagem mais
// recente, para a conversa ativa subir como numa caixa de entrada comum.
export function listConversationsFor(userId) {
  const db = getDb();
  const directs = db.prepare("SELECT * FROM chat_conversations WHERE user_a_id = ? OR user_b_id = ?").all(userId, userId);

  const general = {
    id: null,
    kind: "general",
    otherUserId: null,
    lastMessage: lastMessageFor(db, null),
    unreadCount: unreadCountFor(db, userId, null),
  };

  const directItems = directs
    .map((c) => ({
      id: c.id,
      kind: "direct",
      otherUserId: c.user_a_id === userId ? c.user_b_id : c.user_a_id,
      lastMessage: lastMessageFor(db, c.id),
      unreadCount: unreadCountFor(db, userId, c.id),
    }))
    .sort((x, y) => (y.lastMessage?.createdAt || "").localeCompare(x.lastMessage?.createdAt || ""));

  return [general, ...directItems];
}

// Um cartão isolado, para o painel de plataforma poder registrar o antes e o depois
// de uma correção de suporte.
export function getCardById(id) {
  const c = getDb().prepare("SELECT * FROM cards WHERE id = ?").get(id);
  if (!c) return null;
  return {
    id: c.id,
    listId: c.list_id,
    title: c.title,
    description: c.description,
    labels: JSON.parse(c.labels || "[]"),
    due: c.due || null,
    startDate: c.start_date || null,
    checklist: JSON.parse(c.checklist || "[]"),
    subtasks: JSON.parse(c.subtasks || "[]"),
    memberIds: JSON.parse(c.member_ids || "[]"),
    completed: !!c.completed,
    urgent: !!c.urgent,
    important: !!c.important,
    archived: !!c.archived,
    creatorId: c.creator_id || null,
  };
}

// Workspace sem filtro de visibilidade, incluindo quadros privados. Existe só para
// o painel de plataforma em modo auditoria, e o acesso a ele é registrado em
// admin/tenant.js — nunca chame daqui do app do cliente, que é onde a regra de
// quadro privado precisa continuar valendo.
export function getWorkspaceCompleto() {
  return montarWorkspace(getDb().prepare("SELECT * FROM boards ORDER BY position ASC").all());
}

export function getWorkspace(userId) {
  // O quadro privado de outra pessoa só entra na lista se houver concessão
  // explícita. É esta cláusula que o mantém fora da barra lateral de quem não foi
  // convidado — a recusa por rota é a segunda camada, não a primeira.
  const boards = getDb()
    .prepare(
      `SELECT * FROM boards
        WHERE visibility = 'shared'
           OR owner_id = ?
           OR id IN (SELECT board_id FROM board_permissions WHERE user_id = ?)
        ORDER BY position ASC`
    )
    .all(userId, userId);
  return montarWorkspace(boards, userId);
}

function papelNoQuadro(board, permissoesDoQuadro, userId) {
  if (!userId) return null;
  if (board.owner_id === userId) return "owner";
  return permissoesDoQuadro.find((p) => p.user_id === userId)?.role || null;
}

// userId opcional: o painel de plataforma monta o workspace sem usuário, e ali
// `myRole` sai null porque administrador não tem papel dentro do quadro do cliente.
function montarWorkspace(boards, userId) {
  const lists = getDb().prepare("SELECT * FROM lists ORDER BY position ASC").all();
  const cards = getDb().prepare("SELECT * FROM cards ORDER BY position ASC").all();
  const permissoes = getDb().prepare("SELECT board_id, user_id, role FROM board_permissions").all();

  return boards.map((b) => {
    const boardLists = lists.filter((l) => l.board_id === b.id);
    const cardsObj = {};
    boardLists.forEach((l) => {
      cards
        .filter((c) => c.list_id === l.id)
        .forEach((c) => {
          cardsObj[c.id] = {
            id: c.id,
            title: c.title,
            description: c.description,
            labels: JSON.parse(c.labels || "[]"),
            due: c.due || null,
            startDate: c.start_date || null,
            location: c.location ? JSON.parse(c.location) : null,
            checklist: JSON.parse(c.checklist || "[]"),
            subtasks: JSON.parse(c.subtasks || "[]"),
            memberIds: JSON.parse(c.member_ids || "[]"),
            completed: !!c.completed,
            urgent: !!c.urgent,
            important: !!c.important,
            attachments: JSON.parse(c.attachments || "[]"),
            archived: !!c.archived,
            archivedAt: c.archived_at || null,
            completedAt: c.completed_at || null,
            listEnteredAt: c.list_entered_at || null,
            createdAt: c.created_at || null,
            // Coluna de origem, para o modal de arquivados mostrar de onde veio
            // e para o restaurar saber para onde devolver.
            archivedFrom: c.archived ? l.id : null,
            // Só quem criou (ou dono do quadro/master da empresa) exclui - o
            // cliente decide se mostra o botão de excluir com isto (ver
            // CardModal.jsx/CardItem.jsx), mas quem decide de fato é o servidor,
            // na rota de exclusão.
            creatorId: c.creator_id || null,
          };
        });
    });
    const doQuadro = b.visibility === "private" ? permissoes.filter((p) => p.board_id === b.id) : [];
    return {
      id: b.id,
      title: b.title,
      background: b.background || null,
      ownerId: b.owner_id || null,
      visibility: b.visibility || "shared",
      // Papel de quem está lendo, já resolvido no servidor: o cliente não
      // reimplementa a regra, só desenha o que veio (mesmo princípio de /api/plan).
      // null no quadro compartilhado, onde não existe papel — todos editam.
      myRole: b.visibility === "private" ? papelNoQuadro(b, doQuadro, userId) : null,
      // Só os convidados, sem o dono: é o que a barra lateral usa para dizer
      // "compartilhado com N pessoas" sem contar quem compartilhou.
      sharedWith: doQuadro.filter((p) => p.role !== "owner").map((p) => p.user_id),
      autoArchiveDays: b.auto_archive_days || null,
      lists: boardLists.map((l) => ({
        id: l.id,
        title: l.title,
        color: l.color || null,
        stuckHours: l.stuck_hours || null,
        // Arquivado sai daqui, e é só isso que o tira do quadro e de todas as views:
        // elas montam suas listas de cartões percorrendo cardIds (via flattenCards).
        cardIds: cards.filter((c) => c.list_id === l.id && !c.archived).map((c) => c.id),
      })),
      cards: cardsObj,
    };
  });
}

// ---------- Cartões recorrentes ----------
function parseRecurrence(row) {
  if (!row) return null;
  return {
    id: row.id,
    boardId: row.board_id,
    listId: row.list_id,
    title: row.title,
    description: row.description,
    checklist: JSON.parse(row.checklist || "[]"),
    labels: JSON.parse(row.labels || "[]"),
    memberIds: JSON.parse(row.member_ids || "[]"),
    freq: row.freq,
    weekday: row.weekday,
    monthday: row.monthday,
    monthday2: row.monthday2,
    hour: row.hour,
    dueInDays: row.due_in_days,
    active: !!row.active,
    lastRunAt: row.last_run_at || null,
    createdAt: row.created_at,
  };
}

export function listRecurrences(boardId) {
  const rows = boardId
    ? getDb().prepare("SELECT * FROM recurrences WHERE board_id = ? ORDER BY created_at ASC").all(boardId)
    : getDb().prepare("SELECT * FROM recurrences ORDER BY created_at ASC").all();
  return rows.map(parseRecurrence);
}

export function getRecurrence(id) {
  return parseRecurrence(getDb().prepare("SELECT * FROM recurrences WHERE id = ?").get(id));
}

export function getBoardIdForRecurrence(id) {
  const row = getDb().prepare("SELECT board_id FROM recurrences WHERE id = ?").get(id);
  return row ? row.board_id : null;
}

export function createRecurrence(boardId, data) {
  const id = data.id || uid();
  getDb()
    .prepare(
      `INSERT INTO recurrences
       (id, board_id, list_id, title, description, checklist, labels, member_ids, freq, weekday, monthday, monthday2, hour, due_in_days, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      id,
      boardId,
      data.listId,
      data.title,
      data.description || "",
      JSON.stringify(data.checklist || []),
      JSON.stringify(data.labels || []),
      JSON.stringify(data.memberIds || []),
      data.freq,
      data.weekday ?? null,
      data.monthday ?? null,
      data.monthday2 ?? null,
      data.hour ?? 0,
      data.dueInDays ?? null,
      nowIso()
    );
  return getRecurrence(id);
}

export function updateRecurrence(id, patch) {
  const atual = getRecurrence(id);
  if (!atual) return null;
  getDb()
    .prepare(
      `UPDATE recurrences SET list_id=?, title=?, description=?, checklist=?, labels=?, member_ids=?,
       freq=?, weekday=?, monthday=?, monthday2=?, hour=?, due_in_days=?, active=? WHERE id=?`
    )
    .run(
      patch.listId ?? atual.listId,
      patch.title ?? atual.title,
      patch.description ?? atual.description,
      JSON.stringify(patch.checklist ?? atual.checklist),
      JSON.stringify(patch.labels ?? atual.labels),
      JSON.stringify(patch.memberIds ?? atual.memberIds),
      patch.freq ?? atual.freq,
      patch.weekday === undefined ? atual.weekday : patch.weekday,
      patch.monthday === undefined ? atual.monthday : patch.monthday,
      patch.monthday2 === undefined ? atual.monthday2 : patch.monthday2,
      patch.hour === undefined ? atual.hour : patch.hour,
      patch.dueInDays === undefined ? atual.dueInDays : patch.dueInDays,
      patch.active === undefined ? (atual.active ? 1 : 0) : patch.active ? 1 : 0,
      id
    );
  return getRecurrence(id);
}

export function deleteRecurrence(id) {
  getDb().prepare("DELETE FROM recurrences WHERE id = ?").run(id);
}

// ---------- Personal tasks (Planejador pessoal) ----------
// Fixo, não por usuário (diferente de boards.auto_archive_days) - o pedido foi
// literal ("depois de 2 dias"), sem tela de configuração por trás.
const PERSONAL_TASK_AUTO_ARCHIVE_DAYS = 2;

function parsePersonalTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    due: row.due,
    completed: !!row.completed,
    completedAt: row.completed_at || null,
    archived: !!row.archived,
    createdAt: row.created_at,
  };
}

// Arquivada some daqui (não aparece mais no calendário nem em "Minhas
// tarefas"), mas a linha continua no banco - mesmo "arquivar não apaga" dos
// cartões de quadro, só que sem tela para reabrir depois, porque ninguém
// pediu uma ainda.
export function listPersonalTasks(userId) {
  return getDb()
    .prepare("SELECT * FROM personal_tasks WHERE user_id = ? AND archived = 0 ORDER BY due ASC, created_at ASC")
    .all(userId)
    .map(parsePersonalTask);
}

export function getPersonalTask(id) {
  return parsePersonalTask(getDb().prepare("SELECT * FROM personal_tasks WHERE id = ?").get(id));
}

export function createPersonalTask(userId, data) {
  const id = uid();
  getDb()
    .prepare("INSERT INTO personal_tasks (id, user_id, title, due, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)")
    .run(id, userId, data.title, data.due, nowIso());
  return getPersonalTask(id);
}

export function updatePersonalTask(id, patch) {
  const atual = getPersonalTask(id);
  if (!atual) return null;
  const completed = patch.completed === undefined ? atual.completed : !!patch.completed;
  // completedAt é a base do arquivamento automático (ver
  // runPersonalTaskAutoArchive) - nasce só quando a tarefa vira concluída, e
  // some se ela for desmarcada, senão desmarcar e marcar de novo não
  // reiniciaria a contagem dos 2 dias.
  const completedAt = completed ? atual.completedAt || nowIso() : null;
  getDb()
    .prepare("UPDATE personal_tasks SET title=?, due=?, completed=?, completed_at=? WHERE id=?")
    .run(patch.title ?? atual.title, patch.due ?? atual.due, completed ? 1 : 0, completedAt, id);
  return getPersonalTask(id);
}

export function deletePersonalTask(id) {
  getDb().prepare("DELETE FROM personal_tasks WHERE id = ?").run(id);
}

// Roda na leitura (GET /api/personal-tasks), mesmo padrão do auto-arquivamento
// de cartão e das recorrências: sem agendador, a varredura acontece na hora em
// que alguém abre a própria agenda.
export function runPersonalTaskAutoArchive(userId, now = new Date()) {
  const cutoff = new Date(now.getTime() - PERSONAL_TASK_AUTO_ARCHIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  getDb()
    .prepare("UPDATE personal_tasks SET archived = 1 WHERE user_id = ? AND completed = 1 AND archived = 0 AND completed_at <= ?")
    .run(userId, cutoff);
}

// Percorre as regras ativas e cria o cartão das que estão devendo. Roda na leitura
// do workspace, como o arquivamento automático: sem agendador, e o que volta para
// o cliente já reflete o que foi gerado.
//
// Gera no máximo UM cartão por regra, mesmo que várias ocorrências tenham passado:
// last_run_at recebe o instante da ocorrência mais recente, e as anteriores são
// dadas como perdidas. Voltar de férias não enche a coluna de tarefas vencidas.
export function runRecurrences(now = new Date()) {
  const rows = getDb().prepare("SELECT * FROM recurrences WHERE active = 1").all();
  const criados = [];

  for (const row of rows) {
    if (!shouldGenerate(row, now)) continue;

    // A lista pode ter sido apagada depois que a regra foi criada.
    const listaExiste = getDb().prepare("SELECT 1 FROM lists WHERE id = ?").get(row.list_id);
    if (!listaExiste) continue;

    const ocorrencia = lastDueOccurrence(row, now);
    const cardId = uid();
    const pos = nextPosition("cards", "list_id", row.list_id);
    const marca = nowIso();

    getDb()
      .prepare(
        `INSERT INTO cards
         (id, list_id, title, description, labels, due, checklist, member_ids, position, list_entered_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        cardId,
        row.list_id,
        row.title,
        row.description || "",
        row.labels || "[]",
        dueDateFor(row, ocorrencia),
        // O checklist do molde entra sempre desmarcado: é uma ocorrência nova da
        // rotina, não a continuação da anterior.
        JSON.stringify(JSON.parse(row.checklist || "[]").map((i) => ({ text: i.text, done: false }))),
        row.member_ids || "[]",
        pos,
        marca,
        // A ocorrência da rotina nasce agora, não na data da ocorrência devida: o
        // relatório pergunta quando o cartão passou a existir, e é hoje que ele
        // apareceu no quadro para alguém fazer.
        marca
      );

    getDb().prepare("UPDATE recurrences SET last_run_at = ? WHERE id = ?").run(ocorrencia.toISOString(), row.id);
    criados.push({ recurrenceId: row.id, cardId, occurrence: ocorrencia.toISOString() });
  }

  return criados;
}

// Caminho de destino para um anexo que está sendo gravado em streaming. O id é
// gerado antes porque o arquivo começa a ser escrito enquanto ainda chega.
export function newAttachmentTarget() {
  const id = uid();
  return { id, path: path.join(attachmentsUploadsDir(), id) };
}

// Registra no cartão um arquivo que já está no disco. Separado do addFileAttachment
// antigo, que recebia o conteúdo inteiro em memória.
export function registerFileAttachment(cardId, { id, name, mimeType, size }) {
  const row = getDb().prepare("SELECT attachments FROM cards WHERE id = ?").get(cardId);
  if (!row) return null;
  const attachments = parseAttachments(row);
  attachments.push({
    id,
    type: "file",
    name,
    url: null,
    mimeType: mimeType || "application/octet-stream",
    size,
    addedAt: nowIso(),
  });
  getDb().prepare("UPDATE cards SET attachments = ? WHERE id = ?").run(JSON.stringify(attachments), cardId);
  return attachments;
}

export function discardAttachmentFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* arquivo pode nem ter sido criado */
  }
}
