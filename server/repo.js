import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, companiesDir } from "./db.js";
import { getCurrentCompanyId } from "./context.js";

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
  getDb().prepare("DELETE FROM boards WHERE id = ?").run(id);
}
export function clearBoard(id) {
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
  getDb().prepare("DELETE FROM lists WHERE id = ?").run(id);
}
export function setListOrder(orderedListIds) {
  const stmt = getDb().prepare("UPDATE lists SET position = ? WHERE id = ?");
  orderedListIds.forEach((id, idx) => stmt.run(idx, id));
}
export function clearListCards(listId) {
  getDb().prepare("DELETE FROM cards WHERE list_id = ?").run(listId);
}
export function listExists(id) {
  return !!getDb().prepare("SELECT 1 FROM lists WHERE id = ?").get(id);
}

export function createCard(listId, { id, title }) {
  const cardId = id || uid();
  const pos = nextPosition("cards", "list_id", listId);
  getDb().prepare(
    "INSERT INTO cards (id, list_id, title, description, labels, due, checklist, member_ids, position) VALUES (?, ?, ?, '', '[]', NULL, '[]', '[]', ?)"
  ).run(cardId, listId, title, pos);
  return cardId;
}
export function deleteCard(id) {
  getDb().prepare("DELETE FROM cards WHERE id = ?").run(id);
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
  getDb().prepare(
    "UPDATE cards SET title=?, description=?, labels=?, due=?, start_date=?, location=?, checklist=?, member_ids=?, completed=?, urgent=?, important=? WHERE id=?"
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
    id
  );
}
export function setCardOrder(listId, cardIds) {
  const stmt = getDb().prepare("UPDATE cards SET list_id = ?, position = ? WHERE id = ?");
  cardIds.forEach((id, idx) => stmt.run(listId, idx, id));
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

export function getWorkspace(userId) {
  const boards = getDb()
    .prepare("SELECT * FROM boards WHERE visibility = 'shared' OR owner_id = ? ORDER BY position ASC")
    .all(userId);
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
          };
        });
    });
    return {
      id: b.id,
      title: b.title,
      background: b.background || null,
      ownerId: b.owner_id || null,
      visibility: b.visibility || "shared",
      lists: boardLists.map((l) => ({
        id: l.id,
        title: l.title,
        color: l.color || null,
        cardIds: cards.filter((c) => c.list_id === l.id).map((c) => c.id),
      })),
      cards: cardsObj,
    };
  });
}
