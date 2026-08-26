// Acesso ao banco do módulo Xaphires Beauty. Como o repo.js de Saúde &
// Clínicas e do CRM: tudo passa por getDb() (resolvido pelo AsyncLocalStorage
// do companyId) - só funciona dentro de um runWithCompany, que requireAuth já
// garante nas rotas autenticadas (e a rota pública de agendamento, na Fase 4,
// reentra na mão, igual anamnesePublica.js).
import fs from "node:fs";
import path from "node:path";
import { getDb, companiesDir } from "../../db.js";
import { uid } from "../../repo.js";
import { getCurrentCompanyId } from "../../context.js";

function nowIso() {
  return new Date().toISOString();
}

// starts_at chega do cliente como data/hora civil ingênua (sem "Z" - mesma
// convenção da Agenda de Saúde & Clínicas: "a hora escolhida no formulário é
// a hora do relógio de quem escolhe", nunca UTC). ends_at precisa nascer no
// MESMO formato ingênuo, senão a comparação de sobreposição
// (starts_at < ? AND ends_at > ?, em routes.js/hasOverlap) mistura um
// horário local com um UTC e erra silenciosamente por causa do fuso.
export function somarMinutosLocal(dataHoraCivil, minutos) {
  const d = new Date(new Date(dataHoraCivil).getTime() + minutos * 60000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------- Resumo (Fase 0) ----------

export function getSummary() {
  const db = getDb();
  const clients = db.prepare("SELECT COUNT(*) AS n FROM beauty_clients WHERE active = 1").get().n;
  const services = db.prepare("SELECT COUNT(*) AS n FROM beauty_services WHERE active = 1").get().n;
  const appointments = db.prepare("SELECT COUNT(*) AS n FROM beauty_appointments").get().n;
  return { clients, services, appointments };
}

// ---------- Clientes ----------

export function listClients() {
  return getDb().prepare("SELECT * FROM beauty_clients WHERE active = 1 ORDER BY name COLLATE NOCASE").all();
}
export function getClient(id) {
  return getDb().prepare("SELECT * FROM beauty_clients WHERE id = ?").get(id) || null;
}
export function insertClient({ name, phone, doc, notes, birthDate }, userId) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO beauty_clients (id, name, phone, doc, notes, birth_date, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, name, phone || "", doc || "", notes || "", birthDate || null, nowIso(), userId || null);
  return getClient(id);
}
export function updateClient(id, c) {
  const a = getClient(id);
  if (!a) return null;
  getDb()
    .prepare("UPDATE beauty_clients SET name = ?, phone = ?, doc = ?, notes = ?, birth_date = ? WHERE id = ?")
    .run(c.name ?? a.name, c.phone ?? a.phone, c.doc ?? a.doc, c.notes ?? a.notes, c.birthDate ?? a.birth_date, id);
  return getClient(id);
}

// ---------- Foto do cliente (Fase 5) ----------
// Mesmo desenho de avatar de paciente em Saúde & Clínicas (por sua vez
// espelhado de server/repo.js: newAvatarTarget/setUserAvatar/getAvatarFile/
// discardAvatarFile) - pasta própria pra não misturar com anexo de cartão.
function clientAvatarsDir() {
  const dir = path.join(companiesDir(), getCurrentCompanyId(), "uploads", "beauty-clients");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
export function newClientAvatarTarget() {
  const id = uid();
  return { id, path: path.join(clientAvatarsDir(), id) };
}
export function setClientAvatar(clientId, { id, mimeType }) {
  const atual = getClient(clientId);
  getDb().prepare("UPDATE beauty_clients SET avatar_path = ?, avatar_mime = ? WHERE id = ?").run(id, mimeType, clientId);
  if (atual?.avatar_path) {
    try {
      fs.unlinkSync(path.join(clientAvatarsDir(), atual.avatar_path));
    } catch {
      /* já pode ter sumido */
    }
  }
  return getClient(clientId);
}
export function getClientAvatarFile(clientId) {
  const c = getClient(clientId);
  if (!c?.avatar_path) return null;
  const filePath = path.join(clientAvatarsDir(), c.avatar_path);
  if (!fs.existsSync(filePath)) return null;
  return { path: filePath, mimeType: c.avatar_mime || "application/octet-stream" };
}
export function discardClientAvatarFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* já pode ter sumido */
  }
}

// Histórico completo de um cliente (sem limite de período - é a ficha
// inteira dele), mais recente primeiro.
export function listAppointmentsForClient(clientId) {
  return getDb()
    .prepare(`${SELECT_APPT} WHERE a.client_id = ? ORDER BY a.starts_at DESC`)
    .all(clientId);
}

// Ranking de clientes por frequência e faturamento no período - mesmo
// espírito de reports.js em Saúde & Clínicas (agregação no servidor, a
// tela só desenha). "Frequência" conta agendamentos concluídos; "maior
// faturamento" soma os pagamentos - os dois no mesmo período, porque
// misturar um "sempre" com um "do mês" confundiria o que está sendo
// comparado.
export function getClientRanking(from, to) {
  return getDb()
    .prepare(
      `SELECT c.id AS client_id, c.name,
              COUNT(DISTINCT CASE WHEN a.status = 'concluido' AND a.starts_at >= ? AND a.starts_at < ? THEN a.id END) AS visits,
              COALESCE(SUM(CASE WHEN p.paid_at >= ? AND p.paid_at < ? THEN p.amount_cents END), 0) AS total_cents
         FROM beauty_clients c
         LEFT JOIN beauty_appointments a ON a.client_id = c.id
         LEFT JOIN beauty_payments p ON p.appointment_id = a.id
        WHERE c.active = 1
        GROUP BY c.id
       HAVING visits > 0 OR total_cents > 0
        ORDER BY total_cents DESC, visits DESC`
    )
    .all(from, to, from, to);
}

// Aniversariantes nos próximos N dias (incluindo hoje) - vira do ano em
// dezembro/janeiro, então o cálculo é feito aqui, não em SQL puro (SQLite
// não tem um jeito direto de comparar "dia do ano, com virada" numa
// cláusula WHERE). Volume de clientes de um salão é baixo o bastante pra
// isso não pesar.
export function listUpcomingBirthdays(days) {
  const clientes = getDb().prepare("SELECT id, name, phone, birth_date FROM beauty_clients WHERE active = 1 AND birth_date IS NOT NULL").all();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return clientes
    .map((c) => {
      const [, mes, dia] = c.birth_date.split("-").map(Number);
      let proximo = new Date(hoje.getFullYear(), mes - 1, dia);
      if (proximo < hoje) proximo = new Date(hoje.getFullYear() + 1, mes - 1, dia);
      const diasAte = Math.round((proximo - hoje) / 86400000);
      return { ...c, diasAte };
    })
    .filter((c) => c.diasAte <= days)
    .sort((a, b) => a.diasAte - b.diasAte);
}
// Usado pelo link público de agendamento (Fase 4): quem já marcou horário
// antes, pelo mesmo telefone, reaproveita o próprio cadastro em vez de
// gerar um cliente duplicado a cada visita ao link.
export function findClientByPhone(phone) {
  if (!phone) return null;
  return getDb().prepare("SELECT * FROM beauty_clients WHERE phone = ? AND active = 1 LIMIT 1").get(phone) || null;
}
// Cliente não é apagado (histórico de agendamento referencia o id) - só sai
// da lista ativa, mesmo padrão de "active" já usado em services/staff.
export function deactivateClient(id) {
  const a = getClient(id);
  if (!a) return null;
  getDb().prepare("UPDATE beauty_clients SET active = 0 WHERE id = ?").run(id);
  return true;
}

// ---------- Serviços ----------

export function listServices() {
  return getDb().prepare("SELECT * FROM beauty_services WHERE active = 1 ORDER BY name COLLATE NOCASE").all();
}
export function getService(id) {
  return getDb().prepare("SELECT * FROM beauty_services WHERE id = ?").get(id) || null;
}
export function insertService({ name, durationMinutes, priceCents, category }) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO beauty_services (id, name, duration_minutes, price_cents, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, name, durationMinutes || 30, priceCents || 0, category || "", nowIso());
  return getService(id);
}
export function updateService(id, s) {
  const a = getService(id);
  if (!a) return null;
  getDb()
    .prepare("UPDATE beauty_services SET name = ?, duration_minutes = ?, price_cents = ?, category = ? WHERE id = ?")
    .run(s.name ?? a.name, s.durationMinutes ?? a.duration_minutes, s.priceCents ?? a.price_cents, s.category ?? a.category, id);
  return getService(id);
}
export function deactivateService(id) {
  const a = getService(id);
  if (!a) return null;
  getDb().prepare("UPDATE beauty_services SET active = 0 WHERE id = ?").run(id);
  return true;
}

// ---------- Foto do serviço (Fase 6) ----------
// Mesmo desenho da foto de cliente (Fase 5) - pasta própria pra não misturar
// com o avatar de cliente nem com anexo de cartão.
function serviceAvatarsDir() {
  const dir = path.join(companiesDir(), getCurrentCompanyId(), "uploads", "beauty-services");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
export function newServiceAvatarTarget() {
  const id = uid();
  return { id, path: path.join(serviceAvatarsDir(), id) };
}
export function setServiceAvatar(serviceId, { id, mimeType }) {
  const atual = getService(serviceId);
  getDb().prepare("UPDATE beauty_services SET avatar_path = ?, avatar_mime = ? WHERE id = ?").run(id, mimeType, serviceId);
  if (atual?.avatar_path) {
    try {
      fs.unlinkSync(path.join(serviceAvatarsDir(), atual.avatar_path));
    } catch {
      /* já pode ter sumido */
    }
  }
  return getService(serviceId);
}
export function getServiceAvatarFile(serviceId) {
  const s = getService(serviceId);
  if (!s?.avatar_path) return null;
  const filePath = path.join(serviceAvatarsDir(), s.avatar_path);
  if (!fs.existsSync(filePath)) return null;
  return { path: filePath, mimeType: s.avatar_mime || "application/octet-stream" };
}
export function discardServiceAvatarFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* já pode ter sumido */
  }
}

// Ranking de serviços por popularidade e faturamento no período - mesma
// forma de getClientRanking, só trocando o agrupamento para service_id.
export function getServiceRanking(from, to) {
  return getDb()
    .prepare(
      `SELECT s.id AS service_id, s.name, s.category,
              COUNT(DISTINCT CASE WHEN a.status = 'concluido' AND a.starts_at >= ? AND a.starts_at < ? THEN a.id END) AS visits,
              COALESCE(SUM(CASE WHEN p.paid_at >= ? AND p.paid_at < ? THEN p.amount_cents END), 0) AS total_cents
         FROM beauty_services s
         LEFT JOIN beauty_appointments a ON a.service_id = s.id
         LEFT JOIN beauty_payments p ON p.appointment_id = a.id
        WHERE s.active = 1
        GROUP BY s.id
       HAVING visits > 0 OR total_cents > 0
        ORDER BY total_cents DESC, visits DESC`
    )
    .all(from, to, from, to);
}

// ---------- Profissionais (Fase 2 - registro interno, sem login) ----------

export function listStaff() {
  return getDb().prepare("SELECT * FROM beauty_staff WHERE active = 1 ORDER BY name COLLATE NOCASE").all();
}
export function getStaffMember(id) {
  return getDb().prepare("SELECT * FROM beauty_staff WHERE id = ?").get(id) || null;
}
export function insertStaff({ name, role, commissionRate }) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO beauty_staff (id, name, role, commission_rate, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, name, role || "", commissionRate || 0, nowIso());
  return getStaffMember(id);
}
export function updateStaff(id, s) {
  const a = getStaffMember(id);
  if (!a) return null;
  getDb()
    .prepare("UPDATE beauty_staff SET name = ?, role = ?, commission_rate = ? WHERE id = ?")
    .run(s.name ?? a.name, s.role ?? a.role, s.commissionRate ?? a.commission_rate, id);
  return getStaffMember(id);
}
export function deactivateStaff(id) {
  const a = getStaffMember(id);
  if (!a) return null;
  getDb().prepare("UPDATE beauty_staff SET active = 0 WHERE id = ?").run(id);
  return true;
}

// ---------- Agendamentos ----------

// Junta nome de cliente/serviço/profissional na mesma consulta - a agenda
// sempre mostra os três juntos, e buscar cada um à parte por agendamento
// seria N+1 requisições à toa (mesmo raciocínio de listOpportunities no CRM).
const SELECT_APPT = `
  SELECT a.*, c.name AS client_name, c.phone AS client_phone,
         s.name AS service_name, s.duration_minutes, s.price_cents,
         st.name AS staff_name
    FROM beauty_appointments a
    JOIN beauty_clients c ON c.id = a.client_id
    JOIN beauty_services s ON s.id = a.service_id
    LEFT JOIN beauty_staff st ON st.id = a.staff_id
`;

export function listAppointments(from, to) {
  return getDb()
    .prepare(`${SELECT_APPT} WHERE a.starts_at < ? AND a.ends_at > ? ORDER BY a.starts_at`)
    .all(to, from);
}
export function getAppointment(id) {
  return getDb().prepare(`${SELECT_APPT} WHERE a.id = ?`).get(id) || null;
}
// Só checa conflito quando há profissional atribuído: sem staffId a agenda
// não sabe quantas "cadeiras" o salão tem, então bloquear globalmente
// impediria atendimentos simultâneos legítimos. Usado pelo link público
// (Fase 4), onde ninguém supervisiona o choque de horário em tempo real -
// no formulário interno, quem agenda vê a agenda do dia e decide.
export function hasOverlap(staffId, startsAt, endsAt) {
  if (!staffId) return false;
  const conflito = getDb()
    .prepare(
      `SELECT 1 FROM beauty_appointments
        WHERE staff_id = ? AND status <> 'cancelado' AND starts_at < ? AND ends_at > ?
        LIMIT 1`
    )
    .get(staffId, endsAt, startsAt);
  return !!conflito;
}

export function insertAppointment({ clientId, serviceId, staffId, startsAt, endsAt, notes, fromPublicLink }, userId) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO beauty_appointments
         (id, client_id, service_id, staff_id, starts_at, ends_at, notes, from_public_link, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, clientId, serviceId, staffId || null, startsAt, endsAt, notes || "", fromPublicLink ? 1 : 0, nowIso(), userId || null);
  return getAppointment(id);
}
export function setAppointmentStatus(id, status) {
  const a = getAppointment(id);
  if (!a) return null;
  getDb().prepare("UPDATE beauty_appointments SET status = ? WHERE id = ?").run(status, id);
  return getAppointment(id);
}

// ---------- Pagamentos (ledger manual, Fase 2) ----------

export function listPayments(from, to) {
  return getDb()
    .prepare(
      `SELECT p.*, a.client_id, a.staff_id, a.service_id, c.name AS client_name
         FROM beauty_payments p
         JOIN beauty_appointments a ON a.id = p.appointment_id
         JOIN beauty_clients c ON c.id = a.client_id
        WHERE p.paid_at >= ? AND p.paid_at < ?
        ORDER BY p.paid_at DESC`
    )
    .all(from, to);
}
export function insertPayment({ appointmentId, method, amountCents, paidAt }, userId) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO beauty_payments (id, appointment_id, method, amount_cents, paid_at, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, appointmentId, method || "dinheiro", amountCents, paidAt || nowIso(), nowIso(), userId || null);
  return getDb().prepare("SELECT * FROM beauty_payments WHERE id = ?").get(id);
}

// Comissão = valor pago * fração do profissional atribuído ao agendamento -
// quem não tem staff_id (atendimento sem profissional atribuído) não entra
// na soma de ninguém. Calculada na hora a partir do ledger, sem tabela
// própria: no volume de um salão (dezenas de pagamentos por período), somar
// de novo a cada consulta sai mais barato que manter uma segunda fonte de
// verdade sincronizada com beauty_payments.
export function getCommissionsSummary(from, to) {
  const pagamentos = getDb()
    .prepare(
      `SELECT p.amount_cents, a.staff_id
         FROM beauty_payments p
         JOIN beauty_appointments a ON a.id = p.appointment_id
        WHERE p.paid_at >= ? AND p.paid_at < ? AND a.staff_id IS NOT NULL`
    )
    .all(from, to);
  const staff = listStaff();
  const porProfissional = new Map(staff.map((s) => [s.id, { staffId: s.id, name: s.name, totalCents: 0, commissionCents: 0 }]));
  for (const p of pagamentos) {
    const linha = porProfissional.get(p.staff_id);
    if (!linha) continue; // profissional desativado depois do pagamento - não gera comissão fantasma
    const s = staff.find((x) => x.id === p.staff_id);
    linha.totalCents += p.amount_cents;
    linha.commissionCents += Math.round(p.amount_cents * (s?.commission_rate || 0));
  }
  return [...porProfissional.values()].filter((l) => l.totalCents > 0);
}
