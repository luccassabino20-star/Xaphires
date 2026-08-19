import { Router } from "express";
import fs from "node:fs";
import Busboy from "busboy";
import { requireAuth, requireWritablePlan, requireModule, requireMaster } from "../../middleware.js";
import { ah } from "../../asyncHandler.js";
import { runWithCompany } from "../../context.js";
import {
  getClinicConfig,
  setClinicType,
  setClinicTheme,
  listPatients,
  getPatient,
  insertPatient,
  updatePatient,
  newPatientAvatarTarget,
  setPatientAvatar,
  getPatientAvatarFile,
  discardPatientAvatarFile,
  listAnamneseTemplates,
  getAnamneseTemplate,
  insertAnamneseTemplate,
  updateAnamneseTemplate,
  listAnamneseResponses,
  getAnamneseResponse,
  criarRascunhoResposta,
  enviarResposta,
  listProcedures,
  existeConflitoHorario,
  listAppointments,
  listAppointmentsByPatient,
  listLogsAgendamento,
  criarAgendamento,
  updateAppointment,
  getAppointment,
  listBlocks,
  insertBlock,
  deleteBlock,
  listWaitlist,
  insertWaitlistEntry,
  cancelarEspera,
  converterEsperaEmAgendamento,
} from "./repo.js";
import { seedAnamneseTemplatesSeVazio, seedProceduresSeVazio } from "./seed.js";

const router = Router();
// Mesma camada tripla do Financeiro: requireAuth resolve o companyId/ALS;
// requireWritablePlan tira a escrita de quem venceu o plano; requireModule
// barra quem não tem o módulo. Rota nova aqui nasce protegida.
router.use(requireAuth, requireWritablePlan, requireModule("saude-clinicas"));

const TIPOS_CLINICA = ["ESTETICA", "NUTRICAO", "BIOMEDICINA_ESTETICA", "MULTIDISCIPLINAR"];
const TEMAS_VALIDOS = ["padrao", "rosa", "azul", "verde", "roxo", "escuro"];
const DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

function parseFields(fields) {
  try {
    return typeof fields === "string" ? JSON.parse(fields) : fields;
  } catch {
    return [];
  }
}
function templateComFieldsParseados(t) {
  return t && { ...t, fields: parseFields(t.fields) };
}

// ---------- Configuração da clínica ----------

router.get(
  "/config",
  ah(async (req, res) => {
    res.json(getClinicConfig());
  })
);

// Só master troca a especialidade da clínica (e agora também o tema visual) -
// mesmo padrão de outras configurações administrativas do app (ver
// setFinanceAccess em users.js). Os dois campos são independentes: o corpo
// pode trazer só um deles (é o que a tela de Aparência faz), e o que não vier
// fica como estava - por isso `!== undefined`, não um valor default.
router.put(
  "/config",
  requireMaster,
  ah(async (req, res) => {
    const { clinicType, theme } = req.body || {};
    if (clinicType !== undefined) {
      if (!TIPOS_CLINICA.includes(clinicType)) {
        return res.status(400).json({ error: "Especialidade inválida", code: "CLINIC_TYPE_INVALID" });
      }
      setClinicType(clinicType);
    }
    if (theme !== undefined) {
      if (!TEMAS_VALIDOS.includes(theme)) {
        return res.status(400).json({ error: "Tema inválido", code: "CLINIC_THEME_INVALID" });
      }
      setClinicTheme(theme);
    }
    res.json(getClinicConfig());
  })
);

// ---------- Pacientes ----------

router.get(
  "/patients",
  ah(async (req, res) => {
    res.json(listPatients());
  })
);

router.post(
  "/patients",
  ah(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Informe o nome do paciente", code: "PATIENT_NAME_REQUIRED" });
    }
    res.status(201).json(insertPatient({ ...req.body, name: name.trim() }, req.user.id));
  })
);

router.patch(
  "/patients/:id",
  ah(async (req, res) => {
    const atualizado = updatePatient(req.params.id, req.body || {});
    if (!atualizado) return res.status(404).json({ error: "Paciente não encontrado", code: "PATIENT_NOT_FOUND" });
    res.json(atualizado);
  })
);

// Histórico do paciente - hoje só alimenta "Última consulta" no detalhe do
// agendamento (AppointmentDetailModal), mas fica genérico (rota própria) para
// uma futura tela de histórico não precisar de outra.
router.get(
  "/patients/:id/appointments",
  ah(async (req, res) => {
    if (!getPatient(req.params.id)) return res.status(404).json({ error: "Paciente não encontrado", code: "PATIENT_NOT_FOUND" });
    res.json(listAppointmentsByPatient(req.params.id));
  })
);

// ---------- Foto do paciente ----------
// Upload em streaming, mesmo desenho de POST /profile/avatar: grava no disco
// aos poucos, conferindo o limite DURANTE a transferência. router.use(...)
// no topo do arquivo já rodou requireAuth (o ALS de companyId está ativo
// aqui, na parte síncrona) - só os eventos do busboy (assíncronos, nascem do
// socket) precisam reentrar no contexto na mão, exatamente como lá.
const PATIENT_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
const TIPOS_IMAGEM_ACEITOS = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

router.post("/patients/:id/photo", (req, res) => {
  if (!getPatient(req.params.id)) return res.status(404).json({ error: "Paciente não encontrado", code: "PATIENT_NOT_FOUND" });
  const alvo = newPatientAvatarTarget();

  let bb;
  try {
    bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: PATIENT_PHOTO_MAX_BYTES } });
  } catch {
    return res.status(400).json({ error: "Envio inválido", code: "INVALID_UPLOAD" });
  }

  let tipo = "";
  let bytes = 0;
  let excedeu = false;
  let tipoInvalido = false;
  let respondido = false;
  let saida = null;
  let descartar = false;

  function apagarQuandoPuder() {
    descartar = true;
    if (!saida || saida.destroyed) discardPatientAvatarFile(alvo.path);
  }
  function falhar(status, body) {
    if (respondido) return;
    respondido = true;
    apagarQuandoPuder();
    req.unpipe(bb);
    res.status(status).json(body);
  }

  bb.on("file", (_campo, stream, info) => {
    tipo = info.mimeType || "";
    if (!TIPOS_IMAGEM_ACEITOS.has(tipo)) {
      tipoInvalido = true;
      stream.resume();
      return falhar(400, { error: "Envie uma imagem PNG, JPEG, WEBP ou GIF", code: "INVALID_IMAGE_TYPE" });
    }
    saida = fs.createWriteStream(alvo.path);
    saida.on("error", () => falhar(500, { error: "Erro ao gravar o arquivo", code: "UPLOAD_FAILED" }));
    saida.on("close", () => {
      if (descartar) discardPatientAvatarFile(alvo.path);
    });
    stream.on("data", (chunk) => {
      bytes += chunk.length;
    });
    stream.on("limit", () => {
      excedeu = true;
      stream.unpipe(saida);
      saida.end();
      falhar(400, { error: `A foto deve ter até ${Math.round(PATIENT_PHOTO_MAX_BYTES / 1024 / 1024)} MB`, code: "PHOTO_TOO_LARGE" });
    });
    stream.on("error", () => falhar(400, { error: "Falha ao receber o arquivo", code: "UPLOAD_FAILED" }));
    stream.pipe(saida);
  });

  bb.on("error", () => falhar(400, { error: "Falha ao receber o arquivo", code: "UPLOAD_FAILED" }));

  function registrar() {
    if (respondido || excedeu || tipoInvalido) return;
    try {
      const atualizado = runWithCompany(req.companyId, () => setPatientAvatar(req.params.id, { id: alvo.id, mimeType: tipo }));
      respondido = true;
      res.status(201).json(atualizado);
    } catch (err) {
      console.error("Falha ao salvar a foto do paciente:", err);
      falhar(500, { error: "Erro ao salvar a foto", code: "PHOTO_SAVE_FAILED" });
    }
  }

  bb.on("close", () => {
    if (respondido || excedeu || tipoInvalido) return;
    if (bytes === 0) return falhar(400, { error: "Arquivo inválido", code: "FILE_REQUIRED" });
    if (saida && !saida.writableFinished) {
      saida.once("finish", registrar);
      return;
    }
    registrar();
  });

  req.on("aborted", () => {
    if (respondido) return;
    respondido = true;
    apagarQuandoPuder();
    req.unpipe(bb);
    saida?.destroy();
  });

  req.pipe(bb);
});

router.get(
  "/patients/:id/photo",
  ah(async (req, res) => {
    const file = getPatientAvatarFile(req.params.id);
    if (!file) return res.status(404).json({ error: "Foto não encontrada", code: "PHOTO_NOT_FOUND" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.sendFile(file.path);
  })
);

// ---------- Templates de anamnese ----------

router.get(
  "/anamnesis-templates",
  ah(async (req, res) => {
    seedAnamneseTemplatesSeVazio();
    res.json(listAnamneseTemplates().map(templateComFieldsParseados));
  })
);

router.post(
  "/anamnesis-templates",
  ah(async (req, res) => {
    const { name, fields } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Informe o nome do template", code: "ANAMNESE_TEMPLATE_NAME_REQUIRED" });
    }
    const criado = insertAnamneseTemplate({ ...req.body, name: name.trim(), fields: fields || [] }, req.user.id, false);
    res.status(201).json(templateComFieldsParseados(criado));
  })
);

router.patch(
  "/anamnesis-templates/:id",
  ah(async (req, res) => {
    const atualizado = updateAnamneseTemplate(req.params.id, req.body || {});
    if (!atualizado) return res.status(404).json({ error: "Template não encontrado", code: "ANAMNESE_TEMPLATE_NOT_FOUND" });
    res.json(templateComFieldsParseados(atualizado));
  })
);

// ---------- Respostas de anamnese ----------

router.get(
  "/anamnesis-responses",
  ah(async (req, res) => {
    res.json(listAnamneseResponses(req.query.patientId || null));
  })
);

router.post(
  "/anamnesis-responses",
  ah(async (req, res) => {
    const { templateId, patientId } = req.body || {};
    if (!templateId || !getAnamneseTemplate(templateId)) {
      return res.status(400).json({ error: "Template inválido", code: "ANAMNESE_TEMPLATE_NOT_FOUND" });
    }
    if (!patientId || !getPatient(patientId)) {
      return res.status(400).json({ error: "Paciente inválido", code: "PATIENT_NOT_FOUND" });
    }
    res.status(201).json(criarRascunhoResposta({ templateId, patientId }, req.user.id));
  })
);

// Gera o token público e devolve a resposta com companyId junto - o cliente
// monta a URL (origin + /anamnese/:companyId/:token) e abre o wa.me com ela.
router.post(
  "/anamnesis-responses/:id/enviar",
  ah(async (req, res) => {
    const atualizado = enviarResposta(req.params.id);
    if (!atualizado) return res.status(404).json({ error: "Ficha não encontrada", code: "ANAMNESE_RESPONSE_NOT_FOUND" });
    res.json({ ...atualizado, companyId: req.companyId });
  })
);

// ---------- Procedimentos ----------

router.get(
  "/procedures",
  ah(async (req, res) => {
    seedProceduresSeVazio();
    res.json(listProcedures());
  })
);

// ---------- Agenda: agendamentos ----------

router.get(
  "/appointments",
  ah(async (req, res) => {
    const { from, to } = req.query;
    if (!DATA_CIVIL.test(from || "") || !DATA_CIVIL.test(to || "")) {
      return res.status(400).json({ error: "Informe o período (from/to) em YYYY-MM-DD", code: "AGENDA_PERIODO_INVALIDO" });
    }
    res.json(listAppointments(from, to));
  })
);

router.post(
  "/appointments",
  ah(async (req, res) => {
    const { patientId, patientName, date, time, durationMin } = req.body || {};
    if (patientId && !getPatient(patientId)) {
      return res.status(400).json({ error: "Paciente inválido", code: "PATIENT_NOT_FOUND" });
    }
    if (!patientId && !(patientName || "").trim()) {
      return res.status(400).json({ error: "Informe o paciente", code: "PATIENT_REQUIRED" });
    }
    if (!DATA_CIVIL.test(date || "") || !HORA.test(time || "")) {
      return res.status(400).json({ error: "Informe data e horário válidos", code: "AGENDA_DATA_HORA_INVALIDOS" });
    }
    if (existeConflitoHorario({ professionalUserId: req.body.professionalUserId, date, time, durationMin: durationMin || 30 })) {
      return res.status(409).json({ error: "Já existe um agendamento ou bloqueio nesse horário", code: "AGENDA_CONFLITO_HORARIO" });
    }
    try {
      res.status(201).json(criarAgendamento(req.body, req.user.id));
    } catch (err) {
      if (err.code) return res.status(400).json({ error: err.message, code: err.code });
      throw err;
    }
  })
);

router.patch(
  "/appointments/:id",
  ah(async (req, res) => {
    const atual = getAppointment(req.params.id);
    if (!atual) return res.status(404).json({ error: "Agendamento não encontrado", code: "AGENDA_APPOINTMENT_NOT_FOUND" });
    const date = req.body.date ?? atual.date;
    const time = req.body.time ?? atual.time;
    const durationMin = req.body.durationMin ?? atual.duration_min;
    const professionalUserId = req.body.professionalUserId !== undefined ? req.body.professionalUserId : atual.professional_user_id;
    // Só reconfere conflito quando a mudança pode ter criado um: reagendar
    // (data/hora/duração/profissional) ou reabrir um cancelado. Só trocar o
    // status para concluído/faltou, por exemplo, não precisa reconferir nada.
    const mudouEncaixe = req.body.date || req.body.time || req.body.durationMin || req.body.professionalUserId !== undefined;
    if (mudouEncaixe && existeConflitoHorario({ professionalUserId, date, time, durationMin, excludeAppointmentId: atual.id })) {
      return res.status(409).json({ error: "Já existe um agendamento ou bloqueio nesse horário", code: "AGENDA_CONFLITO_HORARIO" });
    }
    res.json(updateAppointment(req.params.id, req.body, req.user.id));
  })
);

router.get(
  "/appointments/:id/logs",
  ah(async (req, res) => {
    if (!getAppointment(req.params.id)) return res.status(404).json({ error: "Agendamento não encontrado", code: "AGENDA_APPOINTMENT_NOT_FOUND" });
    res.json(listLogsAgendamento(req.params.id));
  })
);

// ---------- Agenda: bloqueios ----------

router.get(
  "/blocks",
  ah(async (req, res) => {
    const { from, to } = req.query;
    if (!DATA_CIVIL.test(from || "") || !DATA_CIVIL.test(to || "")) {
      return res.status(400).json({ error: "Informe o período (from/to) em YYYY-MM-DD", code: "AGENDA_PERIODO_INVALIDO" });
    }
    res.json(listBlocks(from, to));
  })
);

router.post(
  "/blocks",
  ah(async (req, res) => {
    const { date, time, durationMin } = req.body || {};
    if (!DATA_CIVIL.test(date || "") || !HORA.test(time || "")) {
      return res.status(400).json({ error: "Informe data e horário válidos", code: "AGENDA_DATA_HORA_INVALIDOS" });
    }
    if (existeConflitoHorario({ professionalUserId: req.body.professionalUserId, date, time, durationMin: durationMin || 30 })) {
      return res.status(409).json({ error: "Já existe um agendamento ou bloqueio nesse horário", code: "AGENDA_CONFLITO_HORARIO" });
    }
    res.status(201).json(insertBlock(req.body, req.user.id));
  })
);

router.delete(
  "/blocks/:id",
  ah(async (req, res) => {
    const ok = deleteBlock(req.params.id);
    if (!ok) return res.status(404).json({ error: "Bloqueio não encontrado", code: "AGENDA_BLOCK_NOT_FOUND" });
    res.json({ ok: true });
  })
);

// ---------- Lista de espera ----------

router.get(
  "/waitlist",
  ah(async (req, res) => {
    res.json(listWaitlist());
  })
);

router.post(
  "/waitlist",
  ah(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Informe o nome do paciente", code: "PATIENT_NAME_REQUIRED" });
    }
    res.status(201).json(insertWaitlistEntry({ ...req.body, name: name.trim() }, req.user.id));
  })
);

router.post(
  "/waitlist/:id/cancelar",
  ah(async (req, res) => {
    const ok = cancelarEspera(req.params.id);
    if (!ok) return res.status(404).json({ error: "Item da lista de espera não encontrado", code: "WAITLIST_NOT_FOUND" });
    res.json({ ok: true });
  })
);

router.post(
  "/waitlist/:id/converter",
  ah(async (req, res) => {
    const { date, time, durationMin } = req.body || {};
    if (!DATA_CIVIL.test(date || "") || !HORA.test(time || "")) {
      return res.status(400).json({ error: "Informe data e horário válidos", code: "AGENDA_DATA_HORA_INVALIDOS" });
    }
    if (existeConflitoHorario({ professionalUserId: req.body.professionalUserId, date, time, durationMin: durationMin || 30 })) {
      return res.status(409).json({ error: "Já existe um agendamento ou bloqueio nesse horário", code: "AGENDA_CONFLITO_HORARIO" });
    }
    const criado = converterEsperaEmAgendamento(req.params.id, req.body, req.user.id);
    if (!criado) return res.status(404).json({ error: "Item da lista de espera não encontrado ou já resolvido", code: "WAITLIST_NOT_FOUND" });
    res.status(201).json(criado);
  })
);

export { router };
