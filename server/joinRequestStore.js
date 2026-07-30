// Pedido de entrada numa empresa existente, por CNPJ - ver CLAUDE.md.
//
// Mora no banco do diretório, como billing/store.js e admin/store.js: é dado de
// antes de existir sessão de empresa (o pedido nasce sem usuário autenticado), e
// só volta a fazer sentido depois de aprovado, quando vira uma linha em users.js
// dentro do banco daquela empresa.
//
// A senha do pedido é gravada já com hash (bcrypt), nunca em texto puro - o
// aprovador não vê nem precisa ver a senha que a pessoa escolheu.
import { getDirectoryDb } from "./directory.js";

const db = getDirectoryDb();

db.exec(`
  CREATE TABLE IF NOT EXISTS join_requests (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    locale TEXT,
    created_at TEXT NOT NULL
  );
`);

function nowIso() {
  return new Date().toISOString();
}
function norm(email) {
  return (email || "").trim().toLowerCase();
}

export function createJoinRequest({ id, companyId, name, email, passwordHash, locale }) {
  db.prepare(
    "INSERT INTO join_requests (id, company_id, name, email, password_hash, locale, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, companyId, name, norm(email), passwordHash, locale || null, nowIso());
}

// Barra tanto um segundo pedido para a mesma empresa quanto um pedido para outra
// enquanto o primeiro não é resolvido - a pessoa só pode estar numa fila por vez.
export function hasPendingRequestForEmail(email) {
  return !!db.prepare("SELECT 1 FROM join_requests WHERE email = ?").get(norm(email));
}

export function listJoinRequestsForCompany(companyId) {
  return db
    .prepare("SELECT id, name, email, created_at FROM join_requests WHERE company_id = ? ORDER BY created_at ASC")
    .all(companyId);
}

export function getJoinRequest(id) {
  return db.prepare("SELECT * FROM join_requests WHERE id = ?").get(id) || null;
}

export function deleteJoinRequest(id) {
  db.prepare("DELETE FROM join_requests WHERE id = ?").run(id);
}
