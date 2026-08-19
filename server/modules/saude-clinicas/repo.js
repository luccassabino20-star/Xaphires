// Acesso ao banco do módulo Saúde & Clínicas. Como o repo.js do Financeiro,
// tudo passa por getDb() (resolvido pelo AsyncLocalStorage do companyId) - só
// funciona dentro de um runWithCompany, que requireAuth já garante nas rotas
// autenticadas. A rota pública de anamnese (server/routes/anamnesePublica.js)
// entra no contexto na mão, por isso as funções aqui não sabem (nem precisam
// saber) se quem chamou tem sessão ou não.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, companiesDir } from "../../db.js";
import { uid } from "../../repo.js";
import { getCurrentCompanyId } from "../../context.js";

function nowIso() {
  return new Date().toISOString();
}

// ---------- Configuração da clínica (especialidade) ----------

export function getClinicConfig() {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO clinica_config (id, clinic_type, updated_at) VALUES ('default', 'MULTIDISCIPLINAR', ?)").run(nowIso());
  return db.prepare("SELECT * FROM clinica_config WHERE id = 'default'").get();
}

export function setClinicType(clinicType) {
  getClinicConfig(); // garante a linha
  getDb().prepare("UPDATE clinica_config SET clinic_type = ?, updated_at = ? WHERE id = 'default'").run(clinicType, nowIso());
  return getClinicConfig();
}

// ---------- Pacientes ----------

export function listPatients() {
  return getDb().prepare("SELECT * FROM patients ORDER BY active DESC, name COLLATE NOCASE").all();
}
export function getPatient(id) {
  return getDb().prepare("SELECT * FROM patients WHERE id = ?").get(id) || null;
}
function proximoPatientNumber() {
  const r = getDb().prepare("SELECT COALESCE(MAX(patient_number), 0) AS maxNum FROM patients").get();
  return r.maxNum + 1;
}
export function insertPatient(
  { name, birthDate, gender, phone, cpf, email, notes, civilName, socialGender, rg, phoneHome, phoneWork, smsReminderOptIn, cep, address, addressNumber, complement, neighborhood, city, state, country },
  userId
) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO patients
         (id, patient_number, name, birth_date, gender, phone, cpf, email, notes, active,
          civil_name, social_gender, rg, phone_home, phone_work, sms_reminder_opt_in,
          cep, address, address_number, complement, neighborhood, city, state, country,
          created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      proximoPatientNumber(),
      name,
      birthDate || null,
      gender || "",
      phone || "",
      cpf || "",
      email || "",
      notes || "",
      civilName || "",
      socialGender || "",
      rg || "",
      phoneHome || "",
      phoneWork || "",
      smsReminderOptIn ? 1 : 0,
      cep || "",
      address || "",
      addressNumber || "",
      complement || "",
      neighborhood || "",
      city || "",
      state || "",
      country || "Brasil",
      nowIso(),
      userId || null
    );
  return getPatient(id);
}
export function updatePatient(id, p) {
  const a = getPatient(id);
  if (!a) return null;
  getDb()
    .prepare(
      `UPDATE patients SET name = ?, birth_date = ?, gender = ?, phone = ?, cpf = ?, email = ?, notes = ?, active = ?,
              civil_name = ?, social_gender = ?, rg = ?, phone_home = ?, phone_work = ?, sms_reminder_opt_in = ?,
              cep = ?, address = ?, address_number = ?, complement = ?, neighborhood = ?, city = ?, state = ?, country = ?
       WHERE id = ?`
    )
    .run(
      p.name ?? a.name,
      p.birthDate !== undefined ? p.birthDate || null : a.birth_date,
      p.gender ?? a.gender,
      p.phone ?? a.phone,
      p.cpf ?? a.cpf,
      p.email ?? a.email,
      p.notes ?? a.notes,
      p.active !== undefined ? (p.active ? 1 : 0) : a.active,
      p.civilName ?? a.civil_name,
      p.socialGender ?? a.social_gender,
      p.rg ?? a.rg,
      p.phoneHome ?? a.phone_home,
      p.phoneWork ?? a.phone_work,
      p.smsReminderOptIn !== undefined ? (p.smsReminderOptIn ? 1 : 0) : a.sms_reminder_opt_in,
      p.cep ?? a.cep,
      p.address ?? a.address,
      p.addressNumber ?? a.address_number,
      p.complement ?? a.complement,
      p.neighborhood ?? a.neighborhood,
      p.city ?? a.city,
      p.state ?? a.state,
      p.country ?? a.country,
      id
    );
  return getPatient(id);
}

// ---------- Foto do paciente ----------
// Mesmo desenho de avatar de usuário (server/repo.js: newAvatarTarget/
// setUserAvatar/getAvatarFile/discardAvatarFile), pasta própria pra não
// misturar com uploads/avatars (que é de usuário da plataforma, outra
// entidade).
function patientAvatarsDir() {
  const dir = path.join(companiesDir(), getCurrentCompanyId(), "uploads", "patient-photos");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
export function newPatientAvatarTarget() {
  const id = uid();
  return { id, path: path.join(patientAvatarsDir(), id) };
}
export function setPatientAvatar(patientId, { id, mimeType }) {
  const atual = getPatient(patientId);
  getDb().prepare("UPDATE patients SET avatar_path = ?, avatar_mime = ? WHERE id = ?").run(id, mimeType, patientId);
  if (atual?.avatar_path) discardPatientAvatarFile(path.join(patientAvatarsDir(), atual.avatar_path));
  return getPatient(patientId);
}
export function getPatientAvatarFile(patientId) {
  const p = getPatient(patientId);
  if (!p?.avatar_path) return null;
  const filePath = path.join(patientAvatarsDir(), p.avatar_path);
  if (!fs.existsSync(filePath)) return null;
  return { path: filePath, mimeType: p.avatar_mime || "application/octet-stream" };
}
export function discardPatientAvatarFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* já pode ter sumido */
  }
}

// ---------- Templates de anamnese ----------

export function listAnamneseTemplates() {
  return getDb().prepare("SELECT * FROM anamnesis_templates WHERE active = 1 ORDER BY clinic_area IS NULL DESC, clinic_area, name COLLATE NOCASE").all();
}
export function getAnamneseTemplate(id) {
  return getDb().prepare("SELECT * FROM anamnesis_templates WHERE id = ?").get(id) || null;
}
export function insertAnamneseTemplate({ clinicArea, name, description, fields }, userId, isDefault = false) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO anamnesis_templates (id, clinic_area, name, description, fields, is_default, active, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(id, clinicArea || null, name, description || "", JSON.stringify(fields || []), isDefault ? 1 : 0, nowIso(), userId || null);
  return getAnamneseTemplate(id);
}
export function updateAnamneseTemplate(id, t) {
  const a = getAnamneseTemplate(id);
  if (!a) return null;
  getDb()
    .prepare("UPDATE anamnesis_templates SET clinic_area = ?, name = ?, description = ?, fields = ?, active = ? WHERE id = ?")
    .run(
      t.clinicArea !== undefined ? t.clinicArea || null : a.clinic_area,
      t.name ?? a.name,
      t.description ?? a.description,
      t.fields !== undefined ? JSON.stringify(t.fields) : a.fields,
      t.active !== undefined ? (t.active ? 1 : 0) : a.active,
      id
    );
  return getAnamneseTemplate(id);
}

// ---------- Respostas de anamnese (envio ao paciente) ----------

export function listAnamneseResponses(patientId) {
  const db = getDb();
  const linhas = patientId
    ? db.prepare("SELECT * FROM anamnesis_responses WHERE patient_id = ? ORDER BY created_at DESC").all(patientId)
    : db.prepare("SELECT * FROM anamnesis_responses ORDER BY created_at DESC").all();
  return linhas;
}
export function getAnamneseResponse(id) {
  return getDb().prepare("SELECT * FROM anamnesis_responses WHERE id = ?").get(id) || null;
}
export function criarRascunhoResposta({ templateId, patientId }, userId) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO anamnesis_responses (id, template_id, patient_id, answers, status, created_at, created_by)
       VALUES (?, ?, ?, '{}', 'rascunho', ?, ?)`
    )
    .run(id, templateId, patientId, nowIso(), userId || null);
  return getAnamneseResponse(id);
}

// Gera o token público e marca como enviado. Devolve a resposta atualizada -
// quem chama (a rota) monta a URL com esse token para o link do WhatsApp.
export function enviarResposta(id) {
  const a = getAnamneseResponse(id);
  if (!a) return null;
  const token = crypto.randomBytes(24).toString("base64url");
  getDb()
    .prepare("UPDATE anamnesis_responses SET share_token = ?, status = 'enviado', sent_at = ? WHERE id = ?")
    .run(token, nowIso(), id);
  return getAnamneseResponse(id);
}

// ---------- Acesso público (sem sessão, ver server/routes/anamnesePublica.js) ----------

export function getRespostaPorToken(token) {
  return getDb().prepare("SELECT * FROM anamnesis_responses WHERE share_token = ?").get(token) || null;
}

export function responderAnamnese(token, answers) {
  const a = getRespostaPorToken(token);
  if (!a) return null;
  getDb()
    .prepare("UPDATE anamnesis_responses SET answers = ?, status = 'respondido', responded_at = ? WHERE id = ?")
    .run(JSON.stringify(answers || {}), nowIso(), a.id);
  return getRespostaPorToken(token);
}

// ---------- Procedimentos ----------

export function listProcedures() {
  return getDb().prepare("SELECT * FROM procedures WHERE active = 1 ORDER BY name COLLATE NOCASE").all();
}
export function countProcedures() {
  return getDb().prepare("SELECT COUNT(*) AS c FROM procedures").get().c;
}
export function insertProcedure({ name, priceCents, durationMin }) {
  const id = uid();
  getDb()
    .prepare("INSERT INTO procedures (id, name, price_cents, duration_min, active, created_at) VALUES (?, ?, ?, ?, 1, ?)")
    .run(id, name, priceCents || 0, durationMin || 30, nowIso());
  return getDb().prepare("SELECT * FROM procedures WHERE id = ?").get(id);
}

// ---------- Agenda: horários ocupados (helper de conflito) ----------

function paraMinutos(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
// Dois intervalos [aInicio,aFim) e [bInicio,bFim) se cruzam quando um começa
// antes do outro terminar, nos dois sentidos - é a checagem padrão de
// sobreposição de intervalos, não um "está contido em".
function sobrepoe(inicioA, fimA, inicioB, fimB) {
  return inicioA < fimB && inicioB < fimA;
}

// Verdadeiro se { professionalUserId, date, time, durationMin } bate em cima
// de outro agendamento (não cancelado) ou bloqueio do MESMO profissional, ou
// de um bloqueio GLOBAL (professional_user_id NULL, ex.: feriado da clínica).
// exclude* deixa de fora o próprio registro, para edição/reagendamento não
// colidir consigo mesmo.
export function existeConflitoHorario({ professionalUserId, date, time, durationMin, excludeAppointmentId, excludeBlockId }) {
  const inicio = paraMinutos(time);
  const fim = inicio + (durationMin || 30);
  const db = getDb();

  const agendamentos = db
    .prepare(
      `SELECT id, time, duration_min FROM appointments
        WHERE date = ? AND status != 'cancelado' AND professional_user_id IS ? AND id != ?`
    )
    .all(date, professionalUserId || null, excludeAppointmentId || "");
  for (const a of agendamentos) {
    if (sobrepoe(inicio, fim, paraMinutos(a.time), paraMinutos(a.time) + a.duration_min)) return true;
  }

  const bloqueios = db
    .prepare(
      `SELECT id, time, duration_min FROM schedule_blocks
        WHERE date = ? AND (professional_user_id IS ? OR professional_user_id IS NULL) AND id != ?`
    )
    .all(date, professionalUserId || null, excludeBlockId || "");
  for (const b of bloqueios) {
    if (sobrepoe(inicio, fim, paraMinutos(b.time), paraMinutos(b.time) + b.duration_min)) return true;
  }

  return false;
}

// ---------- Agenda: agendamentos ----------

export function listAppointments(from, to) {
  return getDb()
    .prepare(
      `SELECT a.*, p.name AS patient_name, p.phone AS patient_phone
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
        WHERE a.date BETWEEN ? AND ?
        ORDER BY a.date, a.time`
    )
    .all(from, to);
}
export function getAppointment(id) {
  return getDb().prepare("SELECT * FROM appointments WHERE id = ?").get(id) || null;
}
// Histórico do paciente, mais recente primeiro - alimenta "Última consulta"
// no detalhe do agendamento (o range from/to da grade não cobre o passado).
export function listAppointmentsByPatient(patientId) {
  return getDb()
    .prepare("SELECT * FROM appointments WHERE patient_id = ? ORDER BY date DESC, time DESC")
    .all(patientId);
}
// ---------- Log de eventos do agendamento ----------

function resumoProcedimentos(procedures) {
  try {
    const arr = typeof procedures === "string" ? JSON.parse(procedures) : procedures;
    return Array.isArray(arr) ? arr.map((p) => p.name).join(", ") : "";
  } catch {
    return "";
  }
}

// Grava um snapshot do agendamento no momento do evento - chamado de dentro
// de insertAppointment/updateAppointment, nunca direto da rota, pra nenhum
// caminho de escrita esquecer de registrar (mesmo motivo de
// comAcessoAEmpresa no painel de plataforma centralizar a auditoria).
function registrarLogAgendamento(agendamento, event, userId) {
  getDb()
    .prepare(
      `INSERT INTO appointment_logs
         (id, appointment_id, event, status, date, time, duration_min, payment_type, procedure_summary, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      uid(),
      agendamento.id,
      event,
      agendamento.status,
      agendamento.date,
      agendamento.time,
      agendamento.duration_min,
      agendamento.payment_type,
      resumoProcedimentos(agendamento.procedures),
      nowIso(),
      userId || null
    );
}

export function listLogsAgendamento(appointmentId) {
  return getDb()
    .prepare(
      `SELECT l.*, u.name AS modificado_por
         FROM appointment_logs l
         LEFT JOIN users u ON u.id = l.created_by
        WHERE l.appointment_id = ?
        ORDER BY l.created_at DESC`
    )
    .all(appointmentId);
}

export function insertAppointment(
  { patientId, professionalUserId, title, date, time, durationMin, paymentType, paymentStatus, procedures, notes },
  userId
) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO appointments
         (id, patient_id, professional_user_id, title, date, time, duration_min, status, payment_type, payment_status, procedures, notes, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'agendado', ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      patientId,
      professionalUserId || null,
      title || "",
      date,
      time,
      durationMin || 30,
      paymentType || "particular",
      paymentStatus || "pendente",
      JSON.stringify(procedures || []),
      notes || "",
      nowIso(),
      userId || null
    );
  const criado = getAppointment(id);
  registrarLogAgendamento(criado, "criado", userId);
  return criado;
}
// Cria a partir da rota: aceita um paciente existente (patientId) OU cadastro
// rápido (patientName obrigatório nesse caso) - mesmo desenho de
// criarOportunidade no CRM, mesma UX de "não me faça sair da tela pra
// cadastrar antes".
export function criarAgendamento({ patientId, patientName, patientPhone, ...resto }, userId) {
  let idPaciente = patientId;
  if (!idPaciente) {
    if (!patientName) throw Object.assign(new Error("Informe o paciente"), { code: "PATIENT_REQUIRED" });
    idPaciente = insertPatient({ name: patientName, phone: patientPhone }, userId).id;
  }
  return insertAppointment({ ...resto, patientId: idPaciente }, userId);
}

export function updateAppointment(id, a, userId) {
  const atual = getAppointment(id);
  if (!atual) return null;
  getDb()
    .prepare(
      `UPDATE appointments SET professional_user_id = ?, title = ?, date = ?, time = ?, duration_min = ?, status = ?,
              payment_type = ?, payment_status = ?, procedures = ?, notes = ? WHERE id = ?`
    )
    .run(
      a.professionalUserId !== undefined ? a.professionalUserId || null : atual.professional_user_id,
      a.title ?? atual.title,
      a.date ?? atual.date,
      a.time ?? atual.time,
      a.durationMin ?? atual.duration_min,
      a.status ?? atual.status,
      a.paymentType ?? atual.payment_type,
      a.paymentStatus ?? atual.payment_status,
      a.procedures !== undefined ? JSON.stringify(a.procedures) : atual.procedures,
      a.notes ?? atual.notes,
      id
    );
  const atualizado = getAppointment(id);
  // Um evento por PATCH, priorizando reagendamento: se data/hora mudou, é
  // isso que importa registrar (o status "andou junto" não é o que a
  // recepção quer ver na hora de explicar pro paciente por que a consulta
  // mudou). Editar só procedimento/pagamento/notas não gera log - não é um
  // evento que a tela de log promete mostrar (ver o mock: só Agendado e
  // Reagendado).
  if (atualizado.date !== atual.date || atualizado.time !== atual.time) {
    registrarLogAgendamento(atualizado, "reagendado", userId);
  } else if (atualizado.status !== atual.status) {
    registrarLogAgendamento(atualizado, "status_alterado", userId);
  }
  return atualizado;
}

// ---------- Agenda: bloqueios ----------

export function listBlocks(from, to) {
  return getDb().prepare("SELECT * FROM schedule_blocks WHERE date BETWEEN ? AND ? ORDER BY date, time").all(from, to);
}
export function insertBlock({ professionalUserId, date, time, durationMin, reason }, userId) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO schedule_blocks (id, professional_user_id, date, time, duration_min, reason, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, professionalUserId || null, date, time, durationMin || 30, reason || "", nowIso(), userId || null);
  return getDb().prepare("SELECT * FROM schedule_blocks WHERE id = ?").get(id);
}
export function deleteBlock(id) {
  const info = getDb().prepare("DELETE FROM schedule_blocks WHERE id = ?").run(id);
  return info.changes > 0;
}

// ---------- Lista de espera ----------

export function listWaitlist() {
  return getDb().prepare("SELECT * FROM waitlist WHERE status = 'aguardando' ORDER BY created_at").all();
}
export function getWaitlistEntry(id) {
  return getDb().prepare("SELECT * FROM waitlist WHERE id = ?").get(id) || null;
}
export function insertWaitlistEntry({ patientId, name, phone, procedureId, preferredPeriod, notes }, userId) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO waitlist (id, patient_id, name, phone, procedure_id, preferred_period, notes, status, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'aguardando', ?, ?)`
    )
    .run(id, patientId || null, name, phone || "", procedureId || null, preferredPeriod || "qualquer", notes || "", nowIso(), userId || null);
  return getWaitlistEntry(id);
}
export function cancelarEspera(id) {
  const info = getDb().prepare("UPDATE waitlist SET status = 'cancelado' WHERE id = ? AND status = 'aguardando'").run(id);
  return info.changes > 0;
}

// Converte um item da lista de espera num agendamento de verdade. Se a
// entrada não tem patient_id (cadastro rápido, ainda não é um Patient),
// cria o paciente agora com o nome/telefone que já estavam na espera - é o
// único lugar do módulo em que um Patient nasce fora da tela de Pacientes.
export function converterEsperaEmAgendamento(waitlistId, { professionalUserId, date, time, durationMin }, userId) {
  const entrada = getWaitlistEntry(waitlistId);
  if (!entrada || entrada.status !== "aguardando") return null;

  let patientId = entrada.patient_id;
  if (!patientId) {
    patientId = insertPatient({ name: entrada.name, phone: entrada.phone }, userId).id;
  }

  const agendamento = insertAppointment(
    {
      patientId,
      professionalUserId,
      title: "",
      date,
      time,
      durationMin,
      procedures: entrada.procedure_id ? [{ procedureId: entrada.procedure_id }] : [],
    },
    userId
  );

  getDb().prepare("UPDATE waitlist SET status = 'convertido', patient_id = ? WHERE id = ?").run(patientId, waitlistId);
  return agendamento;
}
