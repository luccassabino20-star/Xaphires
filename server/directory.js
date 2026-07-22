import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.KANBAN_DATA_DIR || path.join(process.cwd(), "server", "data");
fs.mkdirSync(dataDir, { recursive: true });

const directoryDb = new DatabaseSync(path.join(dataDir, "directory.sqlite"));

directoryDb.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_directory (
    email TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    created_at TEXT NOT NULL
  );
`);

function nowIso() {
  return new Date().toISOString();
}
function norm(email) {
  return (email || "").trim().toLowerCase();
}

export function countCompanies() {
  return directoryDb.prepare("SELECT COUNT(*) as c FROM companies").get().c;
}

export function createCompany({ id, name }) {
  directoryDb.prepare("INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)").run(id, name, nowIso());
  return id;
}

export function getCompanyIdForEmail(email) {
  const row = directoryDb.prepare("SELECT company_id FROM user_directory WHERE email = ?").get(norm(email));
  return row ? row.company_id : null;
}

export function addUserToDirectory(email, companyId) {
  directoryDb
    .prepare("INSERT INTO user_directory (email, company_id, created_at) VALUES (?, ?, ?)")
    .run(norm(email), companyId, nowIso());
}

export function removeUserFromDirectory(email) {
  directoryDb.prepare("DELETE FROM user_directory WHERE email = ?").run(norm(email));
}

export function updateUserDirectoryEmail(oldEmail, newEmail) {
  directoryDb.prepare("UPDATE user_directory SET email = ? WHERE email = ?").run(norm(newEmail), norm(oldEmail));
}

// Cria a empresa e registra todos os e-mails migrados numa única transação atômica,
// usado pela migração legada para nunca deixar o diretório pela metade se o processo cair no meio.
export function createCompanyWithMasterDirectoryEntries({ id, name }, emails) {
  directoryDb.exec("BEGIN");
  try {
    createCompany({ id, name });
    for (const email of emails) {
      addUserToDirectory(email, id);
    }
    directoryDb.exec("COMMIT");
  } catch (err) {
    directoryDb.exec("ROLLBACK");
    throw err;
  }
}
