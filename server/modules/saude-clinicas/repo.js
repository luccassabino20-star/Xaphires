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

export function setClinicTheme(theme) {
  getClinicConfig(); // garante a linha
  getDb().prepare("UPDATE clinica_config SET theme = ?, updated_at = ? WHERE id = 'default'").run(theme, nowIso());
  return getClinicConfig();
}

export function setClinicName(clinicName) {
  getClinicConfig(); // garante a linha
  getDb().prepare("UPDATE clinica_config SET clinic_name = ?, updated_at = ? WHERE id = 'default'").run(clinicName, nowIso());
  return getClinicConfig();
}

// ---------- Logo da clínica (white-label) ----------
// Mesmo desenho da foto do paciente (ver mais abaixo): pasta própria pra não
// misturar com uploads de paciente nem com uploads/avatars de usuário da
// plataforma.
function clinicLogoDir() {
  const dir = path.join(companiesDir(), getCurrentCompanyId(), "uploads", "clinic-logo");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
export function newClinicLogoTarget() {
  const id = uid();
  return { id, path: path.join(clinicLogoDir(), id) };
}
export function setClinicLogo({ id, mimeType }) {
  const atual = getClinicConfig();
  getDb().prepare("UPDATE clinica_config SET logo_path = ?, logo_mime = ?, updated_at = ? WHERE id = 'default'").run(id, mimeType, nowIso());
  if (atual?.logo_path) discardClinicLogoFile(path.join(clinicLogoDir(), atual.logo_path));
  return getClinicConfig();
}
export function getClinicLogoFile() {
  const c = getClinicConfig();
  if (!c?.logo_path) return null;
  const filePath = path.join(clinicLogoDir(), c.logo_path);
  if (!fs.existsSync(filePath)) return null;
  return { path: filePath, mimeType: c.logo_mime || "application/octet-stream" };
}
export function discardClinicLogoFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* já pode ter sumido */
  }
}
export function removerClinicLogo() {
  const atual = getClinicConfig();
  if (atual?.logo_path) discardClinicLogoFile(path.join(clinicLogoDir(), atual.logo_path));
  getDb().prepare("UPDATE clinica_config SET logo_path = NULL, logo_mime = NULL, updated_at = ? WHERE id = 'default'").run(nowIso());
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
  {
    name, birthDate, gender, phone, cpf, email, notes, civilName, socialGender, rg, phoneHome, phoneWork,
    smsReminderOptIn, cep, address, addressNumber, complement, neighborhood, city, state, country,
    referralSource, criticalAlert, criticalAlertNotes,
  },
  userId
) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO patients
         (id, patient_number, name, birth_date, gender, phone, cpf, email, notes, active,
          civil_name, social_gender, rg, phone_home, phone_work, sms_reminder_opt_in,
          cep, address, address_number, complement, neighborhood, city, state, country,
          referral_source, critical_alert, critical_alert_notes,
          created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      referralSource || "",
      criticalAlert ? 1 : 0,
      criticalAlertNotes || "",
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
              cep = ?, address = ?, address_number = ?, complement = ?, neighborhood = ?, city = ?, state = ?, country = ?,
              referral_source = ?, critical_alert = ?, critical_alert_notes = ?
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
      p.referralSource ?? a.referral_source,
      p.criticalAlert !== undefined ? (p.criticalAlert ? 1 : 0) : a.critical_alert,
      p.criticalAlertNotes ?? a.critical_alert_notes,
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

// Formulário de CAPTAÇÃO (server/routes/anamnesePublica.js, rota .../novo):
// quem preenche ainda não é paciente cadastrado - ela mesma cria o próprio
// cadastro ao enviar. Paciente e resposta nascem juntos, a resposta já
// "respondido" (não existe rascunho aqui, é preenchimento e envio na mesma
// hora, sem token nem status intermediário).
export function criarPacienteERespostaPublica({ templateId, dadosPaciente, answers }) {
  const paciente = insertPatient(dadosPaciente, null);
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO anamnesis_responses (id, template_id, patient_id, answers, status, responded_at, created_at)
       VALUES (?, ?, ?, ?, 'respondido', ?, ?)`
    )
    .run(id, templateId, paciente.id, JSON.stringify(answers || {}), nowIso(), nowIso());
  return { patient: paciente, response: getAnamneseResponse(id) };
}

// Mesmo update de responderAnamnese, mas pelo id (rota autenticada, quando é
// a própria clínica preenchendo a ficha no prontuário do paciente, não o
// paciente pelo link). Só marca 'respondido'/responded_at na primeira vez -
// reabrir uma ficha já respondida pra corrigir um campo não deveria mexer na
// data em que o paciente de fato respondeu.
export function atualizarRespostaAnamnese(id, answers) {
  const a = getAnamneseResponse(id);
  if (!a) return null;
  if (a.status === "respondido") {
    getDb().prepare("UPDATE anamnesis_responses SET answers = ? WHERE id = ?").run(JSON.stringify(answers || {}), id);
  } else {
    getDb()
      .prepare("UPDATE anamnesis_responses SET answers = ?, status = 'respondido', responded_at = ? WHERE id = ?")
      .run(JSON.stringify(answers || {}), nowIso(), id);
  }
  return getAnamneseResponse(id);
}

// ---------- Procedimentos ----------

export function listProcedures() {
  return getDb().prepare("SELECT * FROM procedures WHERE active = 1 ORDER BY name COLLATE NOCASE").all();
}
// Inclui inativos - é a versão que alimenta a tela de gestão do catálogo
// (precisa mostrar o que foi desativado, com a opção de reativar).
export function listAllProcedures() {
  return getDb().prepare("SELECT * FROM procedures ORDER BY active DESC, name COLLATE NOCASE").all();
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
export function getProcedure(id) {
  return getDb().prepare("SELECT * FROM procedures WHERE id = ?").get(id);
}
// Edição não afeta agendamentos já lançados: procedures ali é snapshot
// (nome/preço gravados soltos no próprio agendamento), então mudar o
// catálogo agora não reescreve o passado - só vale para os próximos.
export function updateProcedure(id, { name, priceCents, durationMin, active }) {
  const atual = getProcedure(id);
  if (!atual) return null;
  getDb()
    .prepare("UPDATE procedures SET name = ?, price_cents = ?, duration_min = ?, active = ? WHERE id = ?")
    .run(
      name !== undefined ? name : atual.name,
      priceCents !== undefined ? priceCents : atual.price_cents,
      durationMin !== undefined ? durationMin : atual.duration_min,
      active !== undefined ? (active ? 1 : 0) : atual.active,
      id
    );
  return getProcedure(id);
}

// ---------- Convênios ----------

export function listInsurancePlans() {
  return getDb().prepare("SELECT * FROM insurance_plans ORDER BY active DESC, name COLLATE NOCASE").all();
}
export function getInsurancePlan(id) {
  return getDb().prepare("SELECT * FROM insurance_plans WHERE id = ?").get(id);
}
export function insertInsurancePlan({ name }) {
  const id = uid();
  getDb().prepare("INSERT INTO insurance_plans (id, name, active, created_at) VALUES (?, ?, 1, ?)").run(id, name, nowIso());
  return getInsurancePlan(id);
}
export function updateInsurancePlan(id, { name, active }) {
  const atual = getInsurancePlan(id);
  if (!atual) return null;
  getDb()
    .prepare("UPDATE insurance_plans SET name = ?, active = ? WHERE id = ?")
    .run(name !== undefined ? name : atual.name, active !== undefined ? (active ? 1 : 0) : atual.active, id);
  return getInsurancePlan(id);
}

// Tabela de preços do convênio: uma linha por procedimento ATIVO, com o
// preço negociado (null quando ainda não foi definido) - LEFT JOIN em vez
// de só devolver o que já tem preço, pra tela sempre listar o catálogo
// inteiro e não deixar procedimento novo invisível até alguém lembrar de
// precificá-lo ali.
export function listPlanPrices(planId) {
  return getDb()
    .prepare(
      `SELECT p.id AS procedure_id, p.name AS procedure_name, p.price_cents AS base_price_cents,
              pp.price_cents AS plan_price_cents
         FROM procedures p
         LEFT JOIN insurance_plan_prices pp ON pp.plan_id = ? AND pp.procedure_id = p.id
        WHERE p.active = 1
        ORDER BY p.name COLLATE NOCASE`
    )
    .all(planId);
}
export function setPlanPrice(planId, procedureId, priceCents) {
  const db = getDb();
  const existente = db.prepare("SELECT id FROM insurance_plan_prices WHERE plan_id = ? AND procedure_id = ?").get(planId, procedureId);
  if (existente) {
    db.prepare("UPDATE insurance_plan_prices SET price_cents = ? WHERE id = ?").run(priceCents, existente.id);
  } else {
    db.prepare("INSERT INTO insurance_plan_prices (id, plan_id, procedure_id, price_cents, created_at) VALUES (?, ?, ?, ?, ?)").run(
      uid(),
      planId,
      procedureId,
      priceCents,
      nowIso()
    );
  }
  return listPlanPrices(planId).find((r) => r.procedure_id === procedureId);
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
  { patientId, professionalUserId, title, date, time, durationMin, paymentType, paymentStatus, procedures, notes, insuranceProvider },
  userId
) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO appointments
         (id, patient_id, professional_user_id, title, date, time, duration_min, status, payment_type, payment_status, procedures, notes, insurance_provider, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'agendado', ?, ?, ?, ?, ?, ?, ?)`
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
      insuranceProvider || "",
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
              payment_type = ?, payment_status = ?, procedures = ?, notes = ?,
              cid_code = ?, cid_description = ?, insurance_provider = ?, satisfaction_score = ? WHERE id = ?`
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
      a.cidCode ?? atual.cid_code,
      a.cidDescription ?? atual.cid_description,
      a.insuranceProvider ?? atual.insurance_provider,
      a.satisfactionScore !== undefined ? a.satisfactionScore : atual.satisfaction_score,
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

// ---------- Comissão por profissional (Relatórios › Repasse) ----------

// Todo mundo da equipe aparece, com 0% pra quem nunca configurou - a tela de
// Repasse precisa listar todos os profissionais, não só os que já têm linha
// em professional_settings.
export function listComissoes() {
  return getDb()
    .prepare(
      `SELECT u.id AS user_id, u.name, COALESCE(ps.commission_pct, 0) AS commission_pct
         FROM users u
         LEFT JOIN professional_settings ps ON ps.user_id = u.id
        ORDER BY u.name COLLATE NOCASE`
    )
    .all();
}

export function definirComissao(userId, commissionPct) {
  const db = getDb();
  const existente = db.prepare("SELECT id FROM professional_settings WHERE user_id = ?").get(userId);
  if (existente) {
    db.prepare("UPDATE professional_settings SET commission_pct = ?, updated_at = ? WHERE user_id = ?").run(commissionPct, nowIso(), userId);
  } else {
    db.prepare("INSERT INTO professional_settings (id, user_id, commission_pct, updated_at) VALUES (?, ?, ?, ?)").run(uid(), userId, commissionPct, nowIso());
  }
  return listComissoes().find((c) => c.user_id === userId);
}

// ---------- Financeiro (Saúde & Clínicas) ----------
// Painel financeiro próprio do módulo - ver o comentário grande em schema.js
// sobre por que este bloco não importa nada de server/modules/financeiro/.

export function listFinContas() {
  return getDb().prepare("SELECT * FROM sc_fin_contas WHERE ativo = 1 ORDER BY nome COLLATE NOCASE").all();
}
export function listAllFinContas() {
  return getDb().prepare("SELECT * FROM sc_fin_contas ORDER BY ativo DESC, nome COLLATE NOCASE").all();
}
export function getFinConta(id) {
  return getDb().prepare("SELECT * FROM sc_fin_contas WHERE id = ?").get(id);
}
export function insertFinConta({ nome, banco, saldoInicialCents }) {
  const id = uid();
  getDb()
    .prepare("INSERT INTO sc_fin_contas (id, nome, banco, saldo_inicial_cents, ativo, created_at) VALUES (?, ?, ?, ?, 1, ?)")
    .run(id, nome, banco || "", saldoInicialCents || 0, nowIso());
  return getFinConta(id);
}
export function updateFinConta(id, { nome, banco, saldoInicialCents, ativo }) {
  const atual = getFinConta(id);
  if (!atual) return null;
  getDb()
    .prepare("UPDATE sc_fin_contas SET nome = ?, banco = ?, saldo_inicial_cents = ?, ativo = ? WHERE id = ?")
    .run(
      nome !== undefined ? nome : atual.nome,
      banco !== undefined ? banco : atual.banco,
      saldoInicialCents !== undefined ? saldoInicialCents : atual.saldo_inicial_cents,
      ativo !== undefined ? (ativo ? 1 : 0) : atual.ativo,
      id
    );
  return getFinConta(id);
}

export function listFinCategorias(tipo) {
  const db = getDb();
  return tipo
    ? db.prepare("SELECT * FROM sc_fin_categorias WHERE ativo = 1 AND tipo = ? ORDER BY nome COLLATE NOCASE").all(tipo)
    : db.prepare("SELECT * FROM sc_fin_categorias WHERE ativo = 1 ORDER BY nome COLLATE NOCASE").all();
}
export function listAllFinCategorias() {
  return getDb().prepare("SELECT * FROM sc_fin_categorias ORDER BY ativo DESC, tipo, nome COLLATE NOCASE").all();
}
export function getFinCategoria(id) {
  return getDb().prepare("SELECT * FROM sc_fin_categorias WHERE id = ?").get(id);
}
export function insertFinCategoria({ nome, tipo }) {
  const id = uid();
  getDb().prepare("INSERT INTO sc_fin_categorias (id, nome, tipo, ativo, created_at) VALUES (?, ?, ?, 1, ?)").run(id, nome, tipo, nowIso());
  return getFinCategoria(id);
}
export function updateFinCategoria(id, { nome, tipo, ativo }) {
  const atual = getFinCategoria(id);
  if (!atual) return null;
  getDb()
    .prepare("UPDATE sc_fin_categorias SET nome = ?, tipo = ?, ativo = ? WHERE id = ?")
    .run(nome !== undefined ? nome : atual.nome, tipo !== undefined ? tipo : atual.tipo, ativo !== undefined ? (ativo ? 1 : 0) : atual.ativo, id);
  return getFinCategoria(id);
}
// Excluir de verdade (diferente de desativar): anula categoria_id nos
// lançamentos que já apontavam pra ela (preserva o lançamento, mesmo padrão
// do centro de custo no módulo Financeiro/ERP IRES) e remove as
// subcategorias dela junto - subcategoria não sobrevive sem a categoria.
export function deleteFinCategoria(id) {
  const db = getDb();
  db.prepare("UPDATE sc_fin_lancamentos SET categoria_id = NULL WHERE categoria_id = ?").run(id);
  db.prepare("DELETE FROM sc_fin_subcategorias WHERE categoria_id = ?").run(id);
  db.prepare("DELETE FROM sc_fin_categorias WHERE id = ?").run(id);
}

export function listAllFinSubcategorias() {
  return getDb().prepare("SELECT * FROM sc_fin_subcategorias ORDER BY ativo DESC, nome COLLATE NOCASE").all();
}
export function listFinSubcategorias(categoriaId) {
  return getDb()
    .prepare("SELECT * FROM sc_fin_subcategorias WHERE categoria_id = ? AND ativo = 1 ORDER BY nome COLLATE NOCASE")
    .all(categoriaId);
}
export function getFinSubcategoria(id) {
  return getDb().prepare("SELECT * FROM sc_fin_subcategorias WHERE id = ?").get(id);
}
export function insertFinSubcategoria({ categoriaId, nome }) {
  const id = uid();
  getDb()
    .prepare("INSERT INTO sc_fin_subcategorias (id, categoria_id, nome, ativo, created_at) VALUES (?, ?, ?, 1, ?)")
    .run(id, categoriaId, nome, nowIso());
  return getFinSubcategoria(id);
}
export function updateFinSubcategoria(id, { nome, ativo }) {
  const atual = getFinSubcategoria(id);
  if (!atual) return null;
  getDb()
    .prepare("UPDATE sc_fin_subcategorias SET nome = ?, ativo = ? WHERE id = ?")
    .run(nome !== undefined ? nome : atual.nome, ativo !== undefined ? (ativo ? 1 : 0) : atual.ativo, id);
  return getFinSubcategoria(id);
}
// Ação em lote (checkbox de seleção da tela de Categorias) - node:sqlite não
// tem db.transaction() do better-sqlite3, então é um loop de UPDATE mesmo.
export function updateManyFinSubcategoriasAtivo(ids, ativo) {
  const db = getDb();
  const stmt = db.prepare("UPDATE sc_fin_subcategorias SET ativo = ? WHERE id = ?");
  for (const id of ids) stmt.run(ativo ? 1 : 0, id);
  return ids.map(getFinSubcategoria).filter(Boolean);
}
// Subcategoria não é referenciada em nenhum outro lugar (o lançamento só
// guarda categoria_id, não subcategoria_id) - excluir é sempre um DELETE
// direto, sem órfão pra limpar.
export function deleteManyFinSubcategorias(ids) {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM sc_fin_subcategorias WHERE id = ?");
  for (const id of ids) stmt.run(id);
}

export function listFinCentrosCusto() {
  return getDb().prepare("SELECT * FROM sc_fin_centros_custo WHERE ativo = 1 ORDER BY nome COLLATE NOCASE").all();
}
export function listAllFinCentrosCusto() {
  return getDb().prepare("SELECT * FROM sc_fin_centros_custo ORDER BY ativo DESC, nome COLLATE NOCASE").all();
}
export function getFinCentroCusto(id) {
  return getDb().prepare("SELECT * FROM sc_fin_centros_custo WHERE id = ?").get(id);
}
export function insertFinCentroCusto({ nome }) {
  const id = uid();
  getDb().prepare("INSERT INTO sc_fin_centros_custo (id, nome, ativo, created_at) VALUES (?, ?, 1, ?)").run(id, nome, nowIso());
  return getFinCentroCusto(id);
}
export function updateFinCentroCusto(id, { nome, ativo }) {
  const atual = getFinCentroCusto(id);
  if (!atual) return null;
  getDb()
    .prepare("UPDATE sc_fin_centros_custo SET nome = ?, ativo = ? WHERE id = ?")
    .run(nome !== undefined ? nome : atual.nome, ativo !== undefined ? (ativo ? 1 : 0) : atual.ativo, id);
  return getFinCentroCusto(id);
}

// Lançamento com os nomes já resolvidos (join), pra tela não precisar de mais
// nenhuma chamada pra desenhar a lista/extrato.
function linhaLancamentoFin(l) {
  return {
    id: l.id, tipo: l.tipo, descricao: l.descricao, valor_cents: l.valor_cents, data: l.data,
    conta_id: l.conta_id, conta_nome: l.conta_nome,
    conta_destino_id: l.conta_destino_id, conta_destino_nome: l.conta_destino_nome,
    categoria_id: l.categoria_id, categoria_nome: l.categoria_nome,
    centro_custo_id: l.centro_custo_id, centro_custo_nome: l.centro_custo_nome,
    convenio_id: l.convenio_id, convenio_nome: l.convenio_nome,
    procedure_id: l.procedure_id, procedure_nome: l.procedure_nome,
  };
}

const SELECT_LANCAMENTOS_FIN = `
  SELECT l.*, c.nome AS conta_nome, cd.nome AS conta_destino_nome, cat.nome AS categoria_nome,
         cc.nome AS centro_custo_nome, ip.name AS convenio_nome, p.name AS procedure_nome
    FROM sc_fin_lancamentos l
    LEFT JOIN sc_fin_contas c ON c.id = l.conta_id
    LEFT JOIN sc_fin_contas cd ON cd.id = l.conta_destino_id
    LEFT JOIN sc_fin_categorias cat ON cat.id = l.categoria_id
    LEFT JOIN sc_fin_centros_custo cc ON cc.id = l.centro_custo_id
    LEFT JOIN insurance_plans ip ON ip.id = l.convenio_id
    LEFT JOIN procedures p ON p.id = l.procedure_id
`;

export function listFinLancamentos({ tipo, contaId, de, ate } = {}) {
  const cond = [];
  const params = [];
  if (tipo) { cond.push("l.tipo = ?"); params.push(tipo); }
  if (contaId) { cond.push("(l.conta_id = ? OR l.conta_destino_id = ?)"); params.push(contaId, contaId); }
  if (de) { cond.push("l.data >= ?"); params.push(de); }
  if (ate) { cond.push("l.data <= ?"); params.push(ate); }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  return getDb()
    .prepare(`${SELECT_LANCAMENTOS_FIN} ${where} ORDER BY l.data DESC, l.created_at DESC`)
    .all(...params)
    .map(linhaLancamentoFin);
}
export function getFinLancamento(id) {
  const row = getDb().prepare(`${SELECT_LANCAMENTOS_FIN} WHERE l.id = ?`).get(id);
  return row ? linhaLancamentoFin(row) : null;
}
export function insertFinLancamento(dados, userId) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO sc_fin_lancamentos
         (id, tipo, descricao, valor_cents, data, conta_id, conta_destino_id, categoria_id, centro_custo_id, convenio_id, procedure_id, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id, dados.tipo, dados.descricao || "", dados.valorCents, dados.data,
      dados.contaId, dados.contaDestinoId || null, dados.categoriaId || null, dados.centroCustoId || null,
      dados.convenioId || null, dados.procedureId || null, nowIso(), userId || null
    );
  return getFinLancamento(id);
}
export function updateFinLancamento(id, dados) {
  const atual = getDb().prepare("SELECT * FROM sc_fin_lancamentos WHERE id = ?").get(id);
  if (!atual) return null;
  getDb()
    .prepare(
      `UPDATE sc_fin_lancamentos SET
         tipo = ?, descricao = ?, valor_cents = ?, data = ?, conta_id = ?, conta_destino_id = ?,
         categoria_id = ?, centro_custo_id = ?, convenio_id = ?, procedure_id = ?
       WHERE id = ?`
    )
    .run(
      dados.tipo !== undefined ? dados.tipo : atual.tipo,
      dados.descricao !== undefined ? dados.descricao : atual.descricao,
      dados.valorCents !== undefined ? dados.valorCents : atual.valor_cents,
      dados.data !== undefined ? dados.data : atual.data,
      dados.contaId !== undefined ? dados.contaId : atual.conta_id,
      dados.contaDestinoId !== undefined ? dados.contaDestinoId : atual.conta_destino_id,
      dados.categoriaId !== undefined ? dados.categoriaId : atual.categoria_id,
      dados.centroCustoId !== undefined ? dados.centroCustoId : atual.centro_custo_id,
      dados.convenioId !== undefined ? dados.convenioId : atual.convenio_id,
      dados.procedureId !== undefined ? dados.procedureId : atual.procedure_id,
      id
    );
  return getFinLancamento(id);
}
export function deleteFinLancamento(id) {
  getDb().prepare("DELETE FROM sc_fin_lancamentos WHERE id = ?").run(id);
}

// Saldo geral é sempre o total ATUAL (independe do filtro de período do
// Resumo) - soma o saldo inicial de cada conta ativa com todo o movimento já
// lançado nela (receita soma, despesa subtrai; transferência sai de uma
// conta e entra noutra, então soma zero no total geral, só muda a
// distribuição entre contas).
export function calcularSaldoGeralFin() {
  const db = getDb();
  const saldoInicial = db.prepare("SELECT COALESCE(SUM(saldo_inicial_cents), 0) AS s FROM sc_fin_contas WHERE ativo = 1").get().s;
  const receitas = db.prepare("SELECT COALESCE(SUM(valor_cents), 0) AS s FROM sc_fin_lancamentos WHERE tipo = 'receita'").get().s;
  const despesas = db.prepare("SELECT COALESCE(SUM(valor_cents), 0) AS s FROM sc_fin_lancamentos WHERE tipo = 'despesa'").get().s;
  return saldoInicial + receitas - despesas;
}

// Resumo do painel (tela Resumo): saldo geral (sempre atual) + três recortes
// do período escolhido - receita por convênio, receita por procedimento e
// balanço mensal (receita x despesa, sem transferência, que é neutra).
export function montarResumoFinanceiro({ de, ate }) {
  const db = getDb();
  const receitas = db
    .prepare(
      `SELECT l.valor_cents, l.convenio_id, ip.name AS convenio_nome, l.procedure_id, p.name AS procedure_nome
         FROM sc_fin_lancamentos l
         LEFT JOIN insurance_plans ip ON ip.id = l.convenio_id
         LEFT JOIN procedures p ON p.id = l.procedure_id
        WHERE l.tipo = 'receita' AND l.data BETWEEN ? AND ?`
    )
    .all(de, ate);

  const porConvenio = new Map();
  const porProcedimento = new Map();
  for (const r of receitas) {
    const chaveConv = r.convenio_nome || "Particular";
    porConvenio.set(chaveConv, (porConvenio.get(chaveConv) || 0) + r.valor_cents);
    const chaveProc = r.procedure_nome || "Outras receitas";
    porProcedimento.set(chaveProc, (porProcedimento.get(chaveProc) || 0) + r.valor_cents);
  }

  const linhas = db
    .prepare(
      `SELECT substr(data, 1, 7) AS mes, tipo, SUM(valor_cents) AS total
         FROM sc_fin_lancamentos
        WHERE tipo IN ('receita', 'despesa') AND data BETWEEN ? AND ?
        GROUP BY mes, tipo
        ORDER BY mes`
    )
    .all(de, ate);
  const balancoPorMes = new Map();
  for (const l of linhas) {
    const atual = balancoPorMes.get(l.mes) || { mes: l.mes, receitas: 0, despesas: 0 };
    if (l.tipo === "receita") atual.receitas = l.total;
    else atual.despesas = l.total;
    balancoPorMes.set(l.mes, atual);
  }

  return {
    saldoGeral: calcularSaldoGeralFin(),
    receitasPorConvenio: [...porConvenio.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
    receitasPorProcedimento: [...porProcedimento.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
    balancoMensal: [...balancoPorMes.values()],
  };
}
