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
  return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.created_at };
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

export function createBoard({ id, title, ownerId, visibility }) {
  const boardId = id || uid();
  const pos = nextPosition("boards");
  getDb().prepare(
    "INSERT INTO boards (id, title, owner_id, visibility, position, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(boardId, title, ownerId || null, visibility === "private" ? "private" : "shared", pos, nowIso());
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
  return { ownerId: row.owner_id, visibility: row.visibility };
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

export function createCard(listId, { id, title }) {
  const cardId = id || uid();
  const pos = nextPosition("cards", "list_id", listId);
  // list_entered_at nasce preenchido: sem isso o cartão fica com NULL e o monitor
  // de gargalos nunca o enxerga, porque hoursStuck() devolve null para NULL. Era
  // justamente o cartão criado e esquecido numa coluna que passava batido.
  getDb().prepare(
    "INSERT INTO cards (id, list_id, title, description, labels, due, checklist, member_ids, position, list_entered_at) VALUES (?, ?, ?, '', '[]', NULL, '[]', '[]', ?, ?)"
  ).run(cardId, listId, title, pos, nowIso());
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
    "UPDATE cards SET title=?, description=?, labels=?, due=?, start_date=?, location=?, checklist=?, member_ids=?, completed=?, urgent=?, important=?, completed_at=? WHERE id=?"
  ).run(
    next.title,
    next.description,
    next.labels,
    next.due,
    next.start_date,
    next.location,
    next.checklist,
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

// ---------- Meeting Minutes (Atas) ----------
function publicMinute(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    authorId: row.author_id,
    attendeeIds: JSON.parse(row.attendee_ids || "[]"),
    agenda: row.agenda || "",
    decisions: row.decisions || "",
    actionItems: JSON.parse(row.action_items || "[]"),
    createdAt: row.created_at,
  };
}
export function listMinutes() {
  return getDb().prepare("SELECT * FROM minutes ORDER BY date DESC, created_at DESC").all().map(publicMinute);
}
export function getMinuteById(id) {
  const row = getDb().prepare("SELECT * FROM minutes WHERE id = ?").get(id);
  return row ? publicMinute(row) : null;
}
export function getMinuteAuthorId(id) {
  const row = getDb().prepare("SELECT author_id FROM minutes WHERE id = ?").get(id);
  return row ? row.author_id : null;
}
export function createMinute({ id, title, date, authorId, attendeeIds, agenda, decisions, actionItems }) {
  const minuteId = id || uid();
  getDb().prepare(
    "INSERT INTO minutes (id, title, date, author_id, attendee_ids, agenda, decisions, action_items, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    minuteId,
    title,
    date,
    authorId || null,
    JSON.stringify(attendeeIds || []),
    agenda || "",
    decisions || "",
    JSON.stringify(actionItems || []),
    nowIso()
  );
  return minuteId;
}
export function updateMinute(id, patch) {
  const row = getDb().prepare("SELECT * FROM minutes WHERE id = ?").get(id);
  if (!row) return;
  const next = {
    title: patch.title ?? row.title,
    date: patch.date ?? row.date,
    attendee_ids: patch.attendeeIds ? JSON.stringify(patch.attendeeIds) : row.attendee_ids,
    agenda: patch.agenda !== undefined ? patch.agenda : row.agenda,
    decisions: patch.decisions !== undefined ? patch.decisions : row.decisions,
    action_items: patch.actionItems ? JSON.stringify(patch.actionItems) : row.action_items,
  };
  getDb().prepare("UPDATE minutes SET title=?, date=?, attendee_ids=?, agenda=?, decisions=?, action_items=? WHERE id=?").run(
    next.title,
    next.date,
    next.attendee_ids,
    next.agenda,
    next.decisions,
    next.action_items,
    id
  );
}
export function deleteMinute(id) {
  getDb().prepare("DELETE FROM minutes WHERE id = ?").run(id);
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
    memberIds: JSON.parse(c.member_ids || "[]"),
    completed: !!c.completed,
    urgent: !!c.urgent,
    important: !!c.important,
    archived: !!c.archived,
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
  const boards = getDb()
    .prepare("SELECT * FROM boards WHERE visibility = 'shared' OR owner_id = ? ORDER BY position ASC")
    .all(userId);
  return montarWorkspace(boards);
}

function montarWorkspace(boards) {
  const lists = getDb().prepare("SELECT * FROM lists ORDER BY position ASC").all();
  const cards = getDb().prepare("SELECT * FROM cards ORDER BY position ASC").all();

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
            memberIds: JSON.parse(c.member_ids || "[]"),
            completed: !!c.completed,
            urgent: !!c.urgent,
            important: !!c.important,
            attachments: JSON.parse(c.attachments || "[]"),
            archived: !!c.archived,
            archivedAt: c.archived_at || null,
            completedAt: c.completed_at || null,
            listEnteredAt: c.list_entered_at || null,
            // Coluna de origem, para o modal de arquivados mostrar de onde veio
            // e para o restaurar saber para onde devolver.
            archivedFrom: c.archived ? l.id : null,
          };
        });
    });
    return {
      id: b.id,
      title: b.title,
      background: b.background || null,
      ownerId: b.owner_id || null,
      visibility: b.visibility || "shared",
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
       (id, board_id, list_id, title, description, checklist, labels, member_ids, freq, weekday, monthday, hour, due_in_days, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
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
       freq=?, weekday=?, monthday=?, hour=?, due_in_days=?, active=? WHERE id=?`
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
         (id, list_id, title, description, labels, due, checklist, member_ids, position, list_entered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
