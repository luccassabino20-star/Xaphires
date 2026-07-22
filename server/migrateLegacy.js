import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { legacyDbPath, companiesDir, getCompanyDb } from "./db.js";
import * as directory from "./directory.js";

const LEGACY_COMPANY_NAME = "IMG ALIANÇA";

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// No Windows, antivírus/indexador podem segurar o arquivo por um instante logo após a cópia.
function renameWithRetry(from, to, attempts = 5, delayMs = 200) {
  for (let i = 0; i < attempts; i++) {
    try {
      fs.renameSync(from, to);
      return true;
    } catch (err) {
      if (i === attempts - 1) throw err;
      sleepSync(delayMs);
    }
  }
  return false;
}

export function migrateLegacyIfNeeded() {
  if (directory.countCompanies() > 0) return;

  const legacyPath = legacyDbPath();
  if (!fs.existsSync(legacyPath)) return;

  let emails;
  try {
    const legacyDb = new DatabaseSync(legacyPath);
    emails = legacyDb.prepare("SELECT email FROM users").all().map((row) => row.email);
    legacyDb.close();
  } catch (err) {
    console.error("[migrateLegacy] Não foi possível ler o banco legado, migração abortada:", err.message);
    return;
  }

  const companyId = crypto.randomUUID();
  const companyDir = path.join(companiesDir(), companyId);
  fs.mkdirSync(companyDir, { recursive: true });
  const newPath = path.join(companyDir, "app.sqlite");
  fs.copyFileSync(legacyPath, newPath);

  // Abre a cópia para validar que o arquivo é um SQLite válido e aplicar/atualizar o schema.
  getCompanyDb(companyId);

  directory.createCompanyWithMasterDirectoryEntries({ id: companyId, name: LEGACY_COMPANY_NAME }, emails);

  try {
    renameWithRetry(legacyPath, `${legacyPath}.migrated-${Date.now()}`);
  } catch (err) {
    console.warn("[migrateLegacy] Não foi possível renomear o arquivo legado (migração já concluída):", err.message);
  }

  console.log(
    `[migrateLegacy] Empresa "${LEGACY_COMPANY_NAME}" criada (id ${companyId}) com ${emails.length} usuário(s) migrado(s).`
  );
}
