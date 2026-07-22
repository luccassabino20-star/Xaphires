import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { getCurrentCompanyId } from "./context.js";

const dataDir = process.env.KANBAN_DATA_DIR || path.join(process.cwd(), "server", "data");
fs.mkdirSync(dataDir, { recursive: true });

export function companiesDir() {
  return path.join(dataDir, "companies");
}

export function legacyDbPath() {
  return path.join(dataDir, "app.sqlite");
}

function addColumnIfMissing(companyDb, table, name, ddl) {
  const columns = companyDb.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(name)) companyDb.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function applySchema(companyDb) {
  companyDb.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('master','member')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      background TEXT,
      owner_id TEXT,
      visibility TEXT NOT NULL DEFAULT 'shared',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      color TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      labels TEXT NOT NULL DEFAULT '[]',
      due TEXT,
      start_date TEXT,
      location TEXT,
      checklist TEXT NOT NULL DEFAULT '[]',
      member_ids TEXT NOT NULL DEFAULT '[]',
      completed INTEGER NOT NULL DEFAULT 0,
      urgent INTEGER NOT NULL DEFAULT 0,
      important INTEGER NOT NULL DEFAULT 0,
      attachments TEXT NOT NULL DEFAULT '[]',
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS minutes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      attendee_ids TEXT NOT NULL DEFAULT '[]',
      agenda TEXT NOT NULL DEFAULT '',
      decisions TEXT NOT NULL DEFAULT '',
      action_items TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
  `);

  addColumnIfMissing(companyDb, "cards", "completed", "completed INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(companyDb, "cards", "start_date", "start_date TEXT");
  addColumnIfMissing(companyDb, "cards", "location", "location TEXT");
  addColumnIfMissing(companyDb, "boards", "background", "background TEXT");
  addColumnIfMissing(companyDb, "boards", "owner_id", "owner_id TEXT");
  addColumnIfMissing(companyDb, "boards", "visibility", "visibility TEXT NOT NULL DEFAULT 'shared'");
  addColumnIfMissing(companyDb, "lists", "color", "color TEXT");
  addColumnIfMissing(companyDb, "cards", "urgent", "urgent INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(companyDb, "cards", "important", "important INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(companyDb, "cards", "attachments", "attachments TEXT NOT NULL DEFAULT '[]'");
}

const cache = new Map();

export function getCompanyDb(companyId) {
  if (cache.has(companyId)) return cache.get(companyId);
  const dir = path.join(companiesDir(), companyId);
  fs.mkdirSync(dir, { recursive: true });
  const companyDb = new DatabaseSync(path.join(dir, "app.sqlite"));
  applySchema(companyDb);
  cache.set(companyId, companyDb);
  return companyDb;
}

export function getDb() {
  return getCompanyDb(getCurrentCompanyId());
}

export function closeAllDbs() {
  for (const companyDb of cache.values()) companyDb.close();
  cache.clear();
}
