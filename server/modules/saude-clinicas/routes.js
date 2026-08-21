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
  setClinicName,
  newClinicLogoTarget,
  setClinicLogo,
  getClinicLogoFile,
  discardClinicLogoFile,
  removerClinicLogo,
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
  listAllProcedures,
  insertProcedure,
  updateProcedure,
  listInsurancePlans,
  getInsurancePlan,
  insertInsurancePlan,
  updateInsurancePlan,
  listPlanPrices,
  setPlanPrice,
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
  listComissoes,
  definirComissao,
} from "./repo.js";
import { seedAnamneseTemplatesSeVazio, seedProceduresSeVazio } from "./seed.js";
import { montarDashboard } from "./dashboard.js";
import { montarRelatorio, TIPOS_RELATORIO } from "./reports.js";
import { gerarCsvRelatorio, gerarPdfRelatorio } from "./reportsExport.js";
import { rotulos } from "./reportsLabels.js";
import { getCompany } from "../../directory.js";

const router = Router();
// Mesma camada tripla do Financeiro: requireAuth resolve o companyId/ALS;
// requireWritablePlan tira a escrita de quem venceu o plano; requireModule
// barra quem não tem o módulo. Rota nova aqui nasce protegida.
router.use(requireAuth, requireWritablePlan, requireModule("saude-clinicas"));

const TIPOS_CLINICA = ["ESTETICA", "NUTRICAO", "BIOMEDICINA_ESTETICA", "MULTIDISCIPLINAR"];
const TEMAS_VALIDOS = ["padrao", "rosa", "azul", "verde", "roxo", "escuro"];
// Compartilhado pelos dois uploads de imagem do módulo (logo da clínica e
// foto do paciente) - subiu pro topo do arquivo pra estar disponível nos
// dois pontos, na ordem em que aparecem no arquivo.
const TIPOS_IMAGEM_ACEITOS = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
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

// Só master troca a especialidade, o tema visual e o nome da clínica -
// mesmo padrão de outras configurações administrativas do app (ver
// setFinanceAccess em users.js). Os três campos são independentes: o corpo
// pode trazer só um deles (é o que cada card de Configurações faz sozinho),
// e o que não vier fica como estava - por isso `!== undefined`, não um
// valor default.
router.put(
  "/config",
  requireMaster,
  ah(async (req, res) => {
    const { clinicType, theme, clinicName } = req.body || {};
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
    if (clinicName !== undefined) {
      setClinicName(String(clinicName).slice(0, 80));
    }
    res.json(getClinicConfig());
  })
);

// ---------- Logo da clínica (white-label) ----------
// Upload em streaming, mesmo desenho de POST /patients/:id/photo logo acima
// (por sua vez espelhado de POST /profile/avatar) - grava no disco aos
// poucos, conferindo o limite DURANTE a transferência. Só master troca,
// mesma régua de especialidade/tema/nome.
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

router.post("/config/logo", requireMaster, (req, res) => {
  const alvo = newClinicLogoTarget();

  let bb;
  try {
    bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: LOGO_MAX_BYTES } });
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
    if (!saida || saida.destroyed) discardClinicLogoFile(alvo.path);
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
      if (descartar) discardClinicLogoFile(alvo.path);
    });
    stream.on("data", (chunk) => {
      bytes += chunk.length;
    });
    stream.on("limit", () => {
      excedeu = true;
      stream.unpipe(saida);
      saida.end();
      falhar(400, { error: `A logo deve ter até ${Math.round(LOGO_MAX_BYTES / 1024 / 1024)} MB`, code: "LOGO_TOO_LARGE" });
    });
    stream.on("error", () => falhar(400, { error: "Falha ao receber o arquivo", code: "UPLOAD_FAILED" }));
    stream.pipe(saida);
  });

  bb.on("error", () => falhar(400, { error: "Falha ao receber o arquivo", code: "UPLOAD_FAILED" }));

  function registrar() {
    if (respondido || excedeu || tipoInvalido) return;
    try {
      const atualizado = runWithCompany(req.companyId, () => setClinicLogo({ id: alvo.id, mimeType: tipo }));
      respondido = true;
      res.status(201).json(atualizado);
    } catch (err) {
      console.error("Falha ao salvar a logo da clínica:", err);
      falhar(500, { error: "Erro ao salvar a logo", code: "LOGO_SAVE_FAILED" });
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
  "/config/logo",
  ah(async (req, res) => {
    const file = getClinicLogoFile();
    if (!file) return res.status(404).json({ error: "Logo não encontrada", code: "LOGO_NOT_FOUND" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.sendFile(file.path);
  })
);

router.delete(
  "/config/logo",
  requireMaster,
  ah(async (req, res) => {
    res.json(removerClinicLogo());
  })
);

// ---------- Dashboard ----------

router.get(
  "/dashboard",
  ah(async (req, res) => {
    const { from, to, professionalId } = req.query;
    if (!DATA_CIVIL.test(from || "") || !DATA_CIVIL.test(to || "")) {
      return res.status(400).json({ error: "Informe o período (from/to) em YYYY-MM-DD", code: "AGENDA_PERIODO_INVALIDO" });
    }
    res.json(montarDashboard({ from, to, professionalId: professionalId || null }));
  })
);

// ---------- Relatórios ----------

const IDIOMAS_RELATORIO = new Set(["pt", "en", "es"]);
const TIPO_DO_FORMATO = { pdf: "application/pdf", csv: "text/csv; charset=utf-8" };
const ACENTOS_RE = new RegExp("[\\u0300-\\u036f]", "g");
// Mesma regra do nome de arquivo do relatório do Kanban: sem acento nem
// espaço, porque Content-Disposition com caractere fora do ASCII exige a
// forma RFC 5987 e navegador antigo salva o nome cru como lixo.
function nomeDeArquivoRelatorio(tipo, extensao) {
  return `${tipo}-${new Date().toISOString().slice(0, 10)}.${extensao}`;
}

function filtrosDoRelatorio(req) {
  const { from, to, professionalId, groupBy, page, pageSize } = req.query;
  if (!DATA_CIVIL.test(from || "") || !DATA_CIVIL.test(to || "")) return null;
  return { from, to, professionalId: professionalId || null, groupBy: groupBy || "categoria", page, pageSize };
}

router.get(
  "/reports/:tipo",
  ah(async (req, res) => {
    if (!TIPOS_RELATORIO.includes(req.params.tipo)) {
      return res.status(404).json({ error: "Relatório não encontrado", code: "REPORT_TYPE_INVALID" });
    }
    const filtros = filtrosDoRelatorio(req);
    if (!filtros) {
      return res.status(400).json({ error: "Informe o período (from/to) em YYYY-MM-DD", code: "AGENDA_PERIODO_INVALIDO" });
    }
    res.json(montarRelatorio(req.params.tipo, filtros));
  })
);

router.get(
  "/reports/:tipo/export",
  ah(async (req, res) => {
    const formato = req.query.formato;
    if (!TIPOS_RELATORIO.includes(req.params.tipo)) {
      return res.status(404).json({ error: "Relatório não encontrado", code: "REPORT_TYPE_INVALID" });
    }
    if (!TIPO_DO_FORMATO[formato]) {
      return res.status(400).json({ error: "Formato não suportado", code: "REPORT_FORMAT_INVALID" });
    }
    const filtros = filtrosDoRelatorio(req);
    if (!filtros) {
      return res.status(400).json({ error: "Informe o período (from/to) em YYYY-MM-DD", code: "AGENDA_PERIODO_INVALIDO" });
    }
    // Exportação não pagina - é o arquivo inteiro que a pessoa pediu, ao
    // contrário da tabela na tela (que só mostra uma página por vez).
    const relatorio = montarRelatorio(req.params.tipo, { ...filtros, page: 1, pageSize: 100000 });
    const idioma = IDIOMAS_RELATORIO.has(req.query.lang) ? req.query.lang : "pt";
    const t = rotulos(idioma);
    const periodoLabel = `${filtros.from} – ${filtros.to}`;
    const args = { tipo: req.params.tipo, colunas: relatorio.colunas, linhas: relatorio.linhas, idioma, t, periodoLabel, empresa: getCompany(req.companyId)?.name || "" };
    const arquivo = formato === "csv" ? gerarCsvRelatorio(args) : await gerarPdfRelatorio(args);
    res.setHeader("Content-Type", TIPO_DO_FORMATO[formato]);
    res.setHeader("Content-Disposition", `attachment; filename="${nomeDeArquivoRelatorio(req.params.tipo, formato)}"`);
    res.setHeader("Content-Length", arquivo.length);
    res.send(arquivo);
  })
);

router.get(
  "/commissions",
  ah(async (req, res) => {
    res.json(listComissoes());
  })
);
// Repasse é dado sensível (percentual sobre a receita de cada profissional) -
// só master configura, mesmo padrão de setFinanceAccess e de trocar tema.
router.put(
  "/commissions/:userId",
  requireMaster,
  ah(async (req, res) => {
    const pct = Number(req.body?.commissionPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: "Informe um percentual entre 0 e 100", code: "COMMISSION_PCT_INVALID" });
    }
    res.json(definirComissao(req.params.userId, pct));
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

// Catálogo completo (incl. inativos), só para quem administra o cadastro.
router.get(
  "/procedures/all",
  requireMaster,
  ah(async (req, res) => {
    seedProceduresSeVazio();
    res.json(listAllProcedures());
  })
);

router.post(
  "/procedures",
  requireMaster,
  ah(async (req, res) => {
    const { name, priceCents, durationMin } = req.body || {};
    if (!(name || "").trim()) return res.status(400).json({ error: "Informe o nome do serviço", code: "PROCEDURE_NAME_REQUIRED" });
    res.status(201).json(insertProcedure({ name: name.trim(), priceCents: Number(priceCents) || 0, durationMin: Number(durationMin) || 30 }));
  })
);

router.patch(
  "/procedures/:id",
  requireMaster,
  ah(async (req, res) => {
    const atualizado = updateProcedure(req.params.id, req.body || {});
    if (!atualizado) return res.status(404).json({ error: "Serviço não encontrado", code: "PROCEDURE_NOT_FOUND" });
    res.json(atualizado);
  })
);

// ---------- Convênios ----------

router.get(
  "/insurance-plans",
  requireMaster,
  ah(async (req, res) => {
    res.json(listInsurancePlans());
  })
);

router.post(
  "/insurance-plans",
  requireMaster,
  ah(async (req, res) => {
    const { name } = req.body || {};
    if (!(name || "").trim()) return res.status(400).json({ error: "Informe o nome do convênio", code: "INSURANCE_PLAN_NAME_REQUIRED" });
    res.status(201).json(insertInsurancePlan({ name: name.trim() }));
  })
);

router.patch(
  "/insurance-plans/:id",
  requireMaster,
  ah(async (req, res) => {
    const atualizado = updateInsurancePlan(req.params.id, req.body || {});
    if (!atualizado) return res.status(404).json({ error: "Convênio não encontrado", code: "INSURANCE_PLAN_NOT_FOUND" });
    res.json(atualizado);
  })
);

router.get(
  "/insurance-plans/:id/prices",
  requireMaster,
  ah(async (req, res) => {
    if (!getInsurancePlan(req.params.id)) return res.status(404).json({ error: "Convênio não encontrado", code: "INSURANCE_PLAN_NOT_FOUND" });
    res.json(listPlanPrices(req.params.id));
  })
);

router.put(
  "/insurance-plans/:id/prices/:procedureId",
  requireMaster,
  ah(async (req, res) => {
    if (!getInsurancePlan(req.params.id)) return res.status(404).json({ error: "Convênio não encontrado", code: "INSURANCE_PLAN_NOT_FOUND" });
    const priceCents = Number(req.body?.priceCents);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      return res.status(400).json({ error: "Informe um preço válido", code: "INSURANCE_PLAN_PRICE_INVALID" });
    }
    res.json(setPlanPrice(req.params.id, req.params.procedureId, Math.round(priceCents)));
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
