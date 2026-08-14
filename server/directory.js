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
// CNPJ ou CPF: obrigatório para empresa nova desde que o cadastro passou a exigir
// (ver register-company em routes/auth.js), mas a coluna não tem NOT NULL porque
// empresa criada antes disso pode não ter. Não tem índice único no schema também -
// checar duplicidade é responsabilidade de quem grava (setCompanyCnpj), não do
// banco. Guardado só com dígitos, mesmo formato que normalizarDoc produz.
addColumnIfMissing("companies", "cnpj", "cnpj TEXT");
// Desconto fixo negociado por fora, em centavos, subtraído do preço de tabela do
// plano em toda cobrança emitida (ver emitirCobranca em billing/lifecycle.js). Não
// é percentual porque nasceu de um valor fechado em reais com o cliente, não de uma
// regra proporcional - e fixo não muda se o preço do plano for reajustado depois,
// o que é a intenção: o combinado foi "paga X a menos", não "paga Y% a menos".
// Vai como discount na cobrança do Asaas (dueDateLimitDays: 0, ver providers/asaas.js),
// então o boleto/Pix mostra o valor cheio com o desconto aplicado, não escondido.
addColumnIfMissing("companies", "discount_cents", "discount_cents INTEGER NOT NULL DEFAULT 0");
// Substitui discount_cents por um desconto independente por plano: o combinado
// com o cliente costuma ser "paga X a menos no Profissional", não um valor que
// deveria seguir valendo do mesmo jeito se a empresa mudasse para o
// Intermediário. JSON em vez de uma tabela própria porque só existem dois
// planos com preço de tabela para descontar (Intermediário e Profissional; o
// Empresarial é sob consulta, sem preço para subtrair) - registro comprido
// demais para uma tabela à parte. Guarda só planId -> centavos, sem chave
// zerada (ver setCompanyPlanDiscount). discount_cents fica no schema sem uso
// novo, só para não quebrar quem ainda tiver essa coluna preenchida.
addColumnIfMissing("companies", "discount_by_plan", "discount_by_plan TEXT");
// Backfill uma vez só: quem já tinha desconto fixo herda ele como desconto do
// próprio plano atual, para a migração não zerar combinado de cliente
// existente. Roda sempre, mas só pega linha ainda não migrada (discount_by_plan
// IS NULL) - a segunda execução não reencontra nada porque a primeira já
// preencheu, mesmo padrão do backfill de completed_at/list_entered_at.
for (const c of directoryDb
  .prepare("SELECT id, plan, discount_cents FROM companies WHERE discount_by_plan IS NULL AND discount_cents > 0")
  .all()) {
  directoryDb
    .prepare("UPDATE companies SET discount_by_plan = ? WHERE id = ?")
    .run(JSON.stringify({ [c.plan]: c.discount_cents }), c.id);
}
directoryDb.exec("UPDATE companies SET discount_by_plan = '{}' WHERE discount_by_plan IS NULL");
// Exceções numéricas por empresa, por fora do que o plano dela dá direito (ver
// maxUsersFor/attachmentLimitFor em plans.js). NULL = sem exceção, usa o teto do
// plano normalmente. Não existe valor para "ilimitado por override" de propósito:
// quem precisa de ilimitado muda para um plano que já é ilimitado (Profissional/
// Empresarial) - a exceção aqui é só para destravar um número específico maior (ou
// menor) que o plano moldaria, não para reimplementar o que plano já resolve.
addColumnIfMissing("companies", "max_users_override", "max_users_override INTEGER");
addColumnIfMissing("companies", "max_attachment_bytes_override", "max_attachment_bytes_override INTEGER");

// Entitlement de módulos da plataforma, controlado pelo painel de administração
// (não é autoatendimento). JSON com a lista de ids de módulos que a empresa pode
// usar. NULL significa "ainda não definido pela plataforma": o padrão então são
// os módulos core (ver companyEntitled em modules.js), para nenhuma empresa
// existente perder o que já tinha ao ligar este recurso. Definir a lista pelo
// painel passa a valer explicitamente por cima do padrão.
addColumnIfMissing("companies", "enabled_modules", "enabled_modules TEXT");

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
// Grava a lista de módulos que a empresa pode usar (ids). Guarda como JSON;
// array vazio é um estado válido e diferente de NULL - "a plataforma definiu que
// nenhum módulo está liberado", em vez de "ainda não definiu". Ver companyEntitled.
export function setCompanyModules(id, moduleIds) {
  const atual = getCompany(id);
  if (!atual) return null;
  directoryDb
    .prepare("UPDATE companies SET enabled_modules = ? WHERE id = ?")
    .run(moduleIds ? JSON.stringify(moduleIds) : null, id);
  return getCompany(id);
}

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

// { planId: centavos }, sem chave para plano sem desconto. Aceita tanto a linha
// crua da empresa (discount_by_plan ainda string) quanto undefined/null, para
// quem só tem o id poder chamar sem reconsultar primeiro.
export function getCompanyPlanDiscounts(company) {
  if (!company?.discount_by_plan) return {};
  try {
    return JSON.parse(company.discount_by_plan);
  } catch {
    return {};
  }
}

// Zerar (discountCents <= 0) remove a chave em vez de gravar 0 - "sem desconto
// neste plano" e "chave ausente" precisam significar a mesma coisa, senão um
// desconto zerado por engano fica living no JSON para sempre sem efeito
// nenhum, só ruído.
export function setCompanyPlanDiscount(id, planId, discountCents) {
  const atual = getCompanyPlanDiscounts(getCompany(id));
  const novo = { ...atual };
  if (discountCents > 0) novo[planId] = discountCents;
  else delete novo[planId];
  directoryDb.prepare("UPDATE companies SET discount_by_plan = ? WHERE id = ?").run(JSON.stringify(novo), id);
  return getCompany(id);
}

// null limpa a exceção (volta a valer o teto do plano); número fixa o teto
// específico desta empresa. A rota que chama isto valida os dois campos antes.
export function setCompanyLimits(id, { maxUsersOverride, maxAttachmentBytesOverride }) {
  directoryDb
    .prepare("UPDATE companies SET max_users_override = ?, max_attachment_bytes_override = ? WHERE id = ?")
    .run(maxUsersOverride ?? null, maxAttachmentBytesOverride ?? null, id);
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
