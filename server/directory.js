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

// Empresas criadas antes do sistema de planos entram como Profissional ativo e sem
// prazo: quem já usava não pode ser interrompido por uma regra criada depois.
// O default da coluna cobre as linhas existentes no próprio ALTER TABLE.
function addColumnIfMissing(table, name, ddl) {
  const columns = directoryDb.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(name)) directoryDb.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
addColumnIfMissing("companies", "plan", "plan TEXT NOT NULL DEFAULT 'professional'");
addColumnIfMissing("companies", "status", "status TEXT NOT NULL DEFAULT 'active'");
addColumnIfMissing("companies", "expires_at", "expires_at TEXT");
// Quando o plano atual passou a valer. Base do cálculo do vencimento mensal.
addColumnIfMissing("companies", "contracted_at", "contracted_at TEXT");
// Empresas anteriores a esta coluna herdam a data de criação: é a melhor
// aproximação disponível e evita o campo ficar vazio para sempre na tela.
directoryDb.exec("UPDATE companies SET contracted_at = created_at WHERE contracted_at IS NULL");
// Até quando a empresa continua escrevendo apesar do vencimento. Quem concede é a
// cobrança, e só para quem tem assinatura tentando pagar: boleto leva dias para
// compensar, e trancar no segundo seguinte puniria quem pagou em dia. Teste que
// terminou não recebe carência, porque já foi tempo livre.
addColumnIfMissing("companies", "grace_until", "grace_until TEXT");
// CNPJ é opcional (empresa pode nunca preencher) e não tem índice único no schema -
// checar duplicidade é responsabilidade de quem grava (setCompanyCnpj), não do
// banco. Guardado só com dígitos, mesmo formato que normalizarDoc produz.
addColumnIfMissing("companies", "cnpj", "cnpj TEXT");

// A cobrança guarda os dados dela no mesmo banco global, porque pagamento é da
// empresa e não de dentro de um quadro. Fica em server/billing/store.js, que cria
// as próprias tabelas — este arquivo continua sendo só o cadastro de empresas.
export function getDirectoryDb() {
  return directoryDb;
}

function nowIso() {
  return new Date().toISOString();
}
function norm(email) {
  return (email || "").trim().toLowerCase();
}

export function countCompanies() {
  return directoryDb.prepare("SELECT COUNT(*) as c FROM companies").get().c;
}

export function createCompany({ id, name, plan, status, expiresAt, contractedAt }) {
  directoryDb
    .prepare(
      "INSERT INTO companies (id, name, created_at, plan, status, expires_at, contracted_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(id, name, nowIso(), plan || "professional", status || "active", expiresAt || null, contractedAt || nowIso());
  return id;
}

export function getCompany(id) {
  return directoryDb.prepare("SELECT * FROM companies WHERE id = ?").get(id) || null;
}

export function setCompanyPlan(id, { plan, status, expiresAt, contractedAt }) {
  const atual = getCompany(id);
  if (!atual) return null;
  directoryDb
    .prepare("UPDATE companies SET plan = ?, status = ?, expires_at = ?, contracted_at = ? WHERE id = ?")
    .run(
      plan ?? atual.plan,
      status ?? atual.status,
      expiresAt === undefined ? atual.expires_at : expiresAt,
      contractedAt === undefined ? atual.contracted_at : contractedAt,
      id
    );
  return getCompany(id);
}

// Estende (ou remove, com null) a carência. Separado do setCompanyPlan porque a
// carência muda no ritmo da cobrança, não no da contratação.
export function setCompanyGrace(id, graceUntil) {
  directoryDb.prepare("UPDATE companies SET grace_until = ? WHERE id = ?").run(graceUntil || null, id);
  return getCompany(id);
}

// Só encontra empresa com CNPJ preenchido - `cnpj IS NULL` nunca bate com `?`
// mesmo passando string vazia, então empresas sem CNPJ cadastrado não aparecem
// aqui à toa (o que seria um jeito de "achar" uma empresa aleatória sem CNPJ).
export function getCompanyIdForCnpj(cnpj) {
  if (!cnpj) return null;
  const row = directoryDb.prepare("SELECT id FROM companies WHERE cnpj = ?").get(cnpj);
  return row ? row.id : null;
}

export function setCompanyCnpj(id, cnpj) {
  directoryDb.prepare("UPDATE companies SET cnpj = ? WHERE id = ?").run(cnpj || null, id);
  return getCompany(id);
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
