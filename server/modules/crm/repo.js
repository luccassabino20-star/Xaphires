// Acesso ao banco do módulo CRM. Mesmo padrão dos outros módulos: tudo passa
// por getDb() (AsyncLocalStorage do companyId), só funciona dentro de um
// runWithCompany, que requireAuth garante nas rotas.
import { getDb } from "../../db.js";
import { uid } from "../../repo.js";

function nowIso() {
  return new Date().toISOString();
}

// ---------- Contatos ----------

export function listContacts() {
  return getDb().prepare("SELECT * FROM crm_contacts ORDER BY name COLLATE NOCASE").all();
}
export function getContact(id) {
  return getDb().prepare("SELECT * FROM crm_contacts WHERE id = ?").get(id) || null;
}
export function insertContact({ name, phone, email, companyName, notes }, userId) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO crm_contacts (id, name, phone, email, company_name, notes, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, name, phone || "", email || "", companyName || "", notes || "", nowIso(), userId || null);
  return getContact(id);
}
export function updateContact(id, c) {
  const a = getContact(id);
  if (!a) return null;
  getDb()
    .prepare("UPDATE crm_contacts SET name = ?, phone = ?, email = ?, company_name = ?, notes = ? WHERE id = ?")
    .run(c.name ?? a.name, c.phone ?? a.phone, c.email ?? a.email, c.companyName ?? a.company_name, c.notes ?? a.notes, id);
  return getContact(id);
}

// ---------- Estágios do funil ----------

export function listStages() {
  return getDb().prepare("SELECT * FROM crm_stages ORDER BY position").all();
}
export function countStages() {
  return getDb().prepare("SELECT COUNT(*) AS c FROM crm_stages").get().c;
}
export function insertStage({ name, position, isWon, isLost }) {
  const id = uid();
  getDb()
    .prepare("INSERT INTO crm_stages (id, name, position, is_won, is_lost, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, name, position, isWon ? 1 : 0, isLost ? 1 : 0, nowIso());
  return id;
}
export function getStage(id) {
  return getDb().prepare("SELECT * FROM crm_stages WHERE id = ?").get(id) || null;
}
function primeiroEstagio() {
  return getDb().prepare("SELECT * FROM crm_stages ORDER BY position LIMIT 1").get() || null;
}

// ---------- Oportunidades (o funil) ----------

export function listOpportunities() {
  // Join com contato: o funil sempre mostra o nome de quem é o negócio, e
  // buscar isso card a card no cliente seria N+1 requisições à toa.
  return getDb()
    .prepare(
      `SELECT o.*, c.name AS contact_name, c.phone AS contact_phone
         FROM crm_opportunities o
         JOIN crm_contacts c ON c.id = o.contact_id
        ORDER BY o.stage_id, o.position`
    )
    .all();
}
export function getOpportunity(id) {
  return getDb().prepare("SELECT * FROM crm_opportunities WHERE id = ?").get(id) || null;
}
function proximaPosicaoNoEstagio(stageId) {
  const r = getDb().prepare("SELECT COALESCE(MAX(position), -1) AS maxPos FROM crm_opportunities WHERE stage_id = ?").get(stageId);
  return r.maxPos + 1;
}

// Cria uma oportunidade (= um lead novo) já no primeiro estágio do funil.
// Aceita um contato existente (contactId) OU os dados de um contato novo
// (contactName obrigatório nesse caso) - poupa o passo de "cadastre o
// contato antes" pra quem só quer lançar o lead rápido.
export function criarOportunidade({ contactId, contactName, contactPhone, contactEmail, title, valueCents, source, notes }, userId) {
  let idContato = contactId;
  if (!idContato) {
    if (!contactName) throw Object.assign(new Error("Informe o contato"), { code: "CRM_CONTACT_REQUIRED" });
    idContato = insertContact({ name: contactName, phone: contactPhone, email: contactEmail }, userId).id;
  }
  const estagio = primeiroEstagio();
  if (!estagio) throw Object.assign(new Error("Funil sem estágios"), { code: "CRM_NO_STAGES" });

  const id = uid();
  const agora = nowIso();
  getDb()
    .prepare(
      `INSERT INTO crm_opportunities
         (id, contact_id, stage_id, title, value_cents, source, notes, position, status, created_at, created_by, moved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aberto', ?, ?, ?)`
    )
    .run(id, idContato, estagio.id, title, valueCents || 0, source || "", notes || "", proximaPosicaoNoEstagio(estagio.id), agora, userId || null, agora);
  return getOpportunity(id);
}

// Move para outro estágio (arrastar no funil) - sempre pro fim da coluna de
// destino, mesmo comportamento simples do "solta no fim" antes de o Kanban
// genérico ganhar reordenação fina dentro da coluna. Se o estágio de destino
// for terminal (ganho/perdido), o status da oportunidade tranca nesse
// resultado - reabrir exige mover para um estágio não-terminal de novo.
export function moverOportunidade(id, stageId) {
  const op = getOpportunity(id);
  if (!op) return null;
  const estagio = getStage(stageId);
  if (!estagio) return null;
  const status = estagio.is_won ? "ganho" : estagio.is_lost ? "perdido" : "aberto";
  getDb()
    .prepare("UPDATE crm_opportunities SET stage_id = ?, position = ?, status = ?, moved_at = ? WHERE id = ?")
    .run(stageId, proximaPosicaoNoEstagio(stageId), status, nowIso(), id);
  return getOpportunity(id);
}

export function atualizarOportunidade(id, o) {
  const a = getOpportunity(id);
  if (!a) return null;
  getDb()
    .prepare("UPDATE crm_opportunities SET title = ?, value_cents = ?, source = ?, notes = ? WHERE id = ?")
    .run(o.title ?? a.title, o.valueCents ?? a.value_cents, o.source ?? a.source, o.notes ?? a.notes, id);
  return getOpportunity(id);
}
