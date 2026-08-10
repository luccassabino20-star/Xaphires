// Persistência do painel de plataforma: administradores e trilha de auditoria.
//
// Mora no banco do diretório, que já é o banco global. Duas tabelas:
//
//   platform_admins  quem pode entrar no painel. SEPARADO da tabela `users` de
//                    cada empresa, de propósito — ver o comentário em admin/auth.js.
//   admin_audit      o que cada um fez. Append-only: nada aqui é atualizado nem
//                    apagado pela aplicação.
//
// A auditoria não é enfeite. O painel lê e escreve dados de clientes, incluindo
// dado pessoal de terceiros que a empresa cliente controla e nós apenas
// hospedamos. Sem registro, não há como responder "quem abriu meus dados e
// quando" — e essa pergunta chega.

import crypto from "node:crypto";
import { getDirectoryDb } from "../directory.js";

const db = getDirectoryDb();

db.exec(`
  CREATE TABLE IF NOT EXISTS platform_admins (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS admin_audit (
    id TEXT PRIMARY KEY,
    admin_id TEXT,
    -- O e-mail fica desnormalizado de propósito: se o admin for removido depois, o
    -- registro precisa continuar dizendo quem foi. Trilha que aponta para uma linha
    -- apagada não serve de trilha.
    admin_email TEXT,
    acao TEXT NOT NULL,
    company_id TEXT,
    alvo TEXT,
    detalhe TEXT,
    ip TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_data ON admin_audit(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_empresa ON admin_audit(company_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit(admin_id, created_at DESC);
`);

// Campos de contato da empresa, que o painel precisa e o cadastro nunca coletou.
function addColumnIfMissing(tabela, nome, ddl) {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
  if (!colunas.includes(nome)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${ddl}`);
}
addColumnIfMissing("companies", "contact_name", "contact_name TEXT");
addColumnIfMissing("companies", "contact_email", "contact_email TEXT");
addColumnIfMissing("companies", "contact_phone", "contact_phone TEXT");
addColumnIfMissing("companies", "doc", "doc TEXT");
addColumnIfMissing("companies", "notes", "notes TEXT");
// Bloqueio administrativo, separado de vencimento de plano. São coisas diferentes:
// vencido é quem não pagou e volta pagando; bloqueado é decisão nossa, e pagar não
// desfaz. Guardar no mesmo campo `status` misturaria as duas e faria a cobrança
// desbloquear alguém sem querer.
addColumnIfMissing("companies", "blocked_at", "blocked_at TEXT");
addColumnIfMissing("companies", "blocked_reason", "blocked_reason TEXT");

function nowIso() {
  return new Date().toISOString();
}

// ---------- Administradores ----------

export function contarAdmins() {
  return db.prepare("SELECT COUNT(*) c FROM platform_admins").get().c;
}

export function acharAdminPorEmail(email) {
  return db.prepare("SELECT * FROM platform_admins WHERE email = ?").get(String(email || "").trim().toLowerCase()) || null;
}

export function acharAdmin(id) {
  return db.prepare("SELECT * FROM platform_admins WHERE id = ?").get(id) || null;
}

export function listarAdmins() {
  return db.prepare("SELECT id, email, name, active, created_at, last_login_at FROM platform_admins ORDER BY created_at ASC").all();
}

export function criarAdmin({ email, name, passwordHash }) {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO platform_admins (id, email, name, password_hash, active, created_at) VALUES (?, ?, ?, ?, 1, ?)"
  ).run(id, String(email).trim().toLowerCase(), name, passwordHash, nowIso());
  return acharAdmin(id);
}

export function marcarLogin(id) {
  db.prepare("UPDATE platform_admins SET last_login_at = ? WHERE id = ?").run(nowIso(), id);
}

export function definirSenhaAdmin(id, passwordHash) {
  db.prepare("UPDATE platform_admins SET password_hash = ? WHERE id = ?").run(passwordHash, id);
  return acharAdmin(id);
}

export function definirAdminAtivo(id, ativo) {
  db.prepare("UPDATE platform_admins SET active = ? WHERE id = ?").run(ativo ? 1 : 0, id);
  return acharAdmin(id);
}

export function publicAdmin(a) {
  if (!a) return null;
  return { id: a.id, email: a.email, name: a.name, active: !!a.active, createdAt: a.created_at, lastLoginAt: a.last_login_at };
}

// ---------- Auditoria ----------

// Append-only. Não existe função de update nem de delete aqui, e isso é proposital:
// trilha que pode ser editada por quem é auditado não vale nada.
export function registrar({ adminId, adminEmail, acao, companyId, alvo, detalhe, ip }) {
  db.prepare(
    "INSERT INTO admin_audit (id, admin_id, admin_email, acao, company_id, alvo, detalhe, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    crypto.randomUUID(),
    adminId || null,
    adminEmail || null,
    acao,
    companyId || null,
    alvo || null,
    detalhe ? JSON.stringify(detalhe).slice(0, 2000) : null,
    ip || null,
    nowIso()
  );
}

export function listarAuditoria({ companyId, adminId, limite = 200 } = {}) {
  const condicoes = [];
  const params = [];
  if (companyId) {
    condicoes.push("company_id = ?");
    params.push(companyId);
  }
  if (adminId) {
    condicoes.push("admin_id = ?");
    params.push(adminId);
  }
  const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  return db
    .prepare(`SELECT * FROM admin_audit ${onde} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limite)
    .map((r) => ({
      id: r.id,
      adminEmail: r.admin_email,
      acao: r.acao,
      companyId: r.company_id,
      alvo: r.alvo,
      detalhe: r.detalhe ? JSON.parse(r.detalhe) : null,
      ip: r.ip,
      createdAt: r.created_at,
    }));
}

// ---------- Empresas, na visão do painel ----------

export function listarEmpresas() {
  return db.prepare("SELECT * FROM companies ORDER BY created_at DESC").all();
}

export function acharEmpresa(id) {
  return db.prepare("SELECT * FROM companies WHERE id = ?").get(id) || null;
}

export function atualizarEmpresa(id, campos) {
  const atual = acharEmpresa(id);
  if (!atual) return null;
  db.prepare(
    `UPDATE companies SET name = ?, contact_name = ?, contact_email = ?, contact_phone = ?, doc = ?, notes = ?
     WHERE id = ?`
  ).run(
    campos.name ?? atual.name,
    campos.contactName === undefined ? atual.contact_name : campos.contactName,
    campos.contactEmail === undefined ? atual.contact_email : campos.contactEmail,
    campos.contactPhone === undefined ? atual.contact_phone : campos.contactPhone,
    campos.doc === undefined ? atual.doc : campos.doc,
    campos.notes === undefined ? atual.notes : campos.notes,
    id
  );
  return acharEmpresa(id);
}

export function definirBloqueio(id, { bloqueado, motivo }) {
  db.prepare("UPDATE companies SET blocked_at = ?, blocked_reason = ? WHERE id = ?").run(
    bloqueado ? nowIso() : null,
    bloqueado ? motivo || null : null,
    id
  );
  return acharEmpresa(id);
}

export function emailsDaEmpresa(companyId) {
  return db.prepare("SELECT email FROM user_directory WHERE company_id = ?").all(companyId).map((r) => r.email);
}
