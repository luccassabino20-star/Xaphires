import { Router } from "express";
import fs from "node:fs";
import Busboy from "busboy";
import { requireAuth, requireWritablePlan, requireModule } from "../../middleware.js";
import { ah } from "../../asyncHandler.js";
import { getCompany } from "../../directory.js";
import { runWithCompany } from "../../context.js";
import { canUseBeautyFinance, canUseBeautyOnlineBooking } from "../../plans.js";
import { docValido } from "../../doc.js";
import {
  getSummary,
  listClients,
  insertClient,
  updateClient,
  deactivateClient,
  listServices,
  insertService,
  updateService,
  deactivateService,
  listStaff,
  insertStaff,
  updateStaff,
  deactivateStaff,
  listAppointments,
  insertAppointment,
  getAppointment,
  getClient,
  getService,
  getStaffMember,
  setAppointmentStatus,
  listPayments,
  insertPayment,
  getCommissionsSummary,
  hasOverlap,
  somarMinutosLocal,
  newClientAvatarTarget,
  setClientAvatar,
  getClientAvatarFile,
  discardClientAvatarFile,
  listAppointmentsForClient,
  getClientRanking,
  listUpcomingBirthdays,
  newServiceAvatarTarget,
  setServiceAvatar,
  getServiceAvatarFile,
  discardServiceAvatarFile,
  getServiceRanking,
  listCommissionOverrides,
  setCommissionOverride,
  removeCommissionOverride,
  getRevenueByMethod,
  getMonthlyFinanceSummary,
} from "./repo.js";
import { getOuCriarSlugAgendamento } from "./agendaSlugStore.js";

const TIPOS_IMAGEM_ACEITOS = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const CLIENT_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
const SERVICE_PHOTO_MAX_BYTES = 3 * 1024 * 1024;

const router = Router();
// Mesma camada tripla dos outros módulos add-on (ver saude-clinicas/
// routes.js): requireAuth resolve o companyId/ALS; requireWritablePlan tira
// a escrita de quem venceu o plano; requireModule barra quem não tem o
// módulo contratado. Rota nova aqui nasce protegida.
router.use(requireAuth, requireWritablePlan, requireModule("xaphires-beauty"));

// Recurso pago (Fase 2/4): barra a rota mesmo que alguém chame direto, não
// só esconda a aba no cliente - mesmo padrão de exigePlano em
// routes/recurrences.js.
function exigeBeautyFinance(req, res, next) {
  if (canUseBeautyFinance(getCompany(req.companyId)?.plan)) return next();
  return res.status(403).json({
    error: "O financeiro e a gestão de equipe estão disponíveis a partir do plano Premium.",
    code: "PLAN_FEATURE_BEAUTY_FINANCE",
  });
}
function exigeBeautyOnlineBooking(req, res, next) {
  if (canUseBeautyOnlineBooking(getCompany(req.companyId)?.plan)) return next();
  return res.status(403).json({
    error: "O agendamento online está disponível a partir do plano Profissional.",
    code: "PLAN_FEATURE_BEAUTY_ONLINE_BOOKING",
  });
}

router.get(
  "/config",
  ah(async (req, res) => {
    res.json(getSummary());
  })
);

// ---------- Clientes ----------

router.get(
  "/clients",
  ah(async (req, res) => {
    res.json(listClients());
  })
);
router.post(
  "/clients",
  ah(async (req, res) => {
    const { name, doc } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Informe o nome do cliente", code: "BEAUTY_CLIENT_NAME_REQUIRED" });
    }
    if (doc && doc.trim() && !docValido(doc)) {
      return res.status(400).json({ error: "CPF/CNPJ inválido", code: "BEAUTY_CLIENT_DOC_INVALID" });
    }
    res.status(201).json(insertClient({ ...req.body, name: name.trim() }, req.user.id));
  })
);
router.patch(
  "/clients/:id",
  ah(async (req, res) => {
    if (req.body?.doc && req.body.doc.trim() && !docValido(req.body.doc)) {
      return res.status(400).json({ error: "CPF/CNPJ inválido", code: "BEAUTY_CLIENT_DOC_INVALID" });
    }
    const atualizado = updateClient(req.params.id, req.body || {});
    if (!atualizado) return res.status(404).json({ error: "Cliente não encontrado", code: "BEAUTY_CLIENT_NOT_FOUND" });
    res.json(atualizado);
  })
);
router.delete(
  "/clients/:id",
  ah(async (req, res) => {
    const ok = deactivateClient(req.params.id);
    if (!ok) return res.status(404).json({ error: "Cliente não encontrado", code: "BEAUTY_CLIENT_NOT_FOUND" });
    res.json({ ok: true });
  })
);

// Ranking e aniversariantes ANTES de /clients/:id/appointments no sentido de
// rota, mas nenhum dos dois colide com ":id" (nomes fixos), então a ordem
// entre eles não importa - só precisam vir antes de qualquer coisa que um
// dia use um segmento genérico igual.
router.get(
  "/clients/ranking",
  ah(async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "Informe o período (from/to)", code: "BEAUTY_PERIOD_REQUIRED" });
    }
    res.json(getClientRanking(from, to));
  })
);
router.get(
  "/clients/birthdays",
  ah(async (req, res) => {
    const dias = Number(req.query.days) || 30;
    res.json(listUpcomingBirthdays(dias));
  })
);
router.get(
  "/clients/:id/appointments",
  ah(async (req, res) => {
    if (!getClient(req.params.id)) return res.status(404).json({ error: "Cliente não encontrado", code: "BEAUTY_CLIENT_NOT_FOUND" });
    res.json(listAppointmentsForClient(req.params.id));
  })
);

// Upload em streaming, mesmo desenho de POST /patients/:id/photo em Saúde &
// Clínicas (por sua vez espelhado de POST /profile/avatar): grava no disco
// aos poucos, conferindo o limite DURANTE a transferência. runWithCompany
// reentra na mão dentro do busboy porque o evento "close" nasce fora da
// pilha síncrona da requisição - o AsyncLocalStorage não atravessa isso
// sozinho (mesma armadilha do upload de anexo de cartão, ver CLAUDE.md).
router.post("/clients/:id/photo", (req, res) => {
  if (!getClient(req.params.id)) return res.status(404).json({ error: "Cliente não encontrado", code: "BEAUTY_CLIENT_NOT_FOUND" });
  const alvo = newClientAvatarTarget();

  let bb;
  try {
    bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: CLIENT_PHOTO_MAX_BYTES } });
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
    if (!saida || saida.destroyed) discardClientAvatarFile(alvo.path);
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
      if (descartar) discardClientAvatarFile(alvo.path);
    });
    stream.on("data", (chunk) => {
      bytes += chunk.length;
    });
    stream.on("limit", () => {
      excedeu = true;
      stream.unpipe(saida);
      saida.end();
      falhar(400, { error: `A foto deve ter até ${Math.round(CLIENT_PHOTO_MAX_BYTES / 1024 / 1024)} MB`, code: "PHOTO_TOO_LARGE" });
    });
    stream.on("error", () => falhar(400, { error: "Falha ao receber o arquivo", code: "UPLOAD_FAILED" }));
    stream.pipe(saida);
  });

  bb.on("error", () => falhar(400, { error: "Falha ao receber o arquivo", code: "UPLOAD_FAILED" }));

  function registrar() {
    if (respondido || excedeu || tipoInvalido) return;
    try {
      const atualizado = runWithCompany(req.companyId, () => setClientAvatar(req.params.id, { id: alvo.id, mimeType: tipo }));
      respondido = true;
      res.status(201).json(atualizado);
    } catch (err) {
      console.error("Falha ao salvar a foto do cliente:", err);
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
  "/clients/:id/photo",
  ah(async (req, res) => {
    const file = getClientAvatarFile(req.params.id);
    if (!file) return res.status(404).json({ error: "Foto não encontrada", code: "PHOTO_NOT_FOUND" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.sendFile(file.path);
  })
);

// ---------- Serviços ----------

router.get(
  "/services",
  ah(async (req, res) => {
    res.json(listServices());
  })
);
router.post(
  "/services",
  ah(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Informe o nome do serviço", code: "BEAUTY_SERVICE_NAME_REQUIRED" });
    }
    res.status(201).json(insertService({ ...req.body, name: name.trim() }));
  })
);
router.patch(
  "/services/:id",
  ah(async (req, res) => {
    const atualizado = updateService(req.params.id, req.body || {});
    if (!atualizado) return res.status(404).json({ error: "Serviço não encontrado", code: "BEAUTY_SERVICE_NOT_FOUND" });
    res.json(atualizado);
  })
);
router.delete(
  "/services/:id",
  ah(async (req, res) => {
    const ok = deactivateService(req.params.id);
    if (!ok) return res.status(404).json({ error: "Serviço não encontrado", code: "BEAUTY_SERVICE_NOT_FOUND" });
    res.json({ ok: true });
  })
);

// Ranking de serviços (Fase 6) - nome fixo, não colide com nenhum :id.
router.get(
  "/services/ranking",
  ah(async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "Informe o período (from/to)", code: "BEAUTY_PERIOD_REQUIRED" });
    }
    res.json(getServiceRanking(from, to));
  })
);

// Upload de foto do serviço (Fase 6) - clone do de POST /clients/:id/photo,
// mesmo motivo do runWithCompany manual (ver comentário lá).
router.post("/services/:id/photo", (req, res) => {
  if (!getService(req.params.id)) return res.status(404).json({ error: "Serviço não encontrado", code: "BEAUTY_SERVICE_NOT_FOUND" });
  const alvo = newServiceAvatarTarget();

  let bb;
  try {
    bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: SERVICE_PHOTO_MAX_BYTES } });
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
    if (!saida || saida.destroyed) discardServiceAvatarFile(alvo.path);
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
      if (descartar) discardServiceAvatarFile(alvo.path);
    });
    stream.on("data", (chunk) => {
      bytes += chunk.length;
    });
    stream.on("limit", () => {
      excedeu = true;
      stream.unpipe(saida);
      saida.end();
      falhar(400, { error: `A foto deve ter até ${Math.round(SERVICE_PHOTO_MAX_BYTES / 1024 / 1024)} MB`, code: "PHOTO_TOO_LARGE" });
    });
    stream.on("error", () => falhar(400, { error: "Falha ao receber o arquivo", code: "UPLOAD_FAILED" }));
    stream.pipe(saida);
  });

  bb.on("error", () => falhar(400, { error: "Falha ao receber o arquivo", code: "UPLOAD_FAILED" }));

  function registrar() {
    if (respondido || excedeu || tipoInvalido) return;
    try {
      const atualizado = runWithCompany(req.companyId, () => setServiceAvatar(req.params.id, { id: alvo.id, mimeType: tipo }));
      respondido = true;
      res.status(201).json(atualizado);
    } catch (err) {
      console.error("Falha ao salvar a foto do serviço:", err);
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
  "/services/:id/photo",
  ah(async (req, res) => {
    const file = getServiceAvatarFile(req.params.id);
    if (!file) return res.status(404).json({ error: "Foto não encontrada", code: "PHOTO_NOT_FOUND" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.sendFile(file.path);
  })
);

// ---------- Agenda ----------

router.get(
  "/appointments",
  ah(async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "Informe o período (from/to)", code: "BEAUTY_PERIOD_REQUIRED" });
    }
    res.json(listAppointments(from, to));
  })
);
router.post(
  "/appointments",
  ah(async (req, res) => {
    const { clientId, serviceId, startsAt } = req.body || {};
    if (!clientId || !getClient(clientId)) {
      return res.status(400).json({ error: "Cliente inválido", code: "BEAUTY_CLIENT_REQUIRED" });
    }
    const servico = serviceId && getService(serviceId);
    if (!servico) {
      return res.status(400).json({ error: "Serviço inválido", code: "BEAUTY_SERVICE_REQUIRED" });
    }
    if (req.body.staffId && !getStaffMember(req.body.staffId)) {
      return res.status(400).json({ error: "Profissional inválido", code: "BEAUTY_STAFF_NOT_FOUND" });
    }
    if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) {
      return res.status(400).json({ error: "Informe a data e hora do agendamento", code: "BEAUTY_STARTS_AT_REQUIRED" });
    }
    const endsAt = somarMinutosLocal(startsAt, servico.duration_minutes);
    if (hasOverlap(req.body.staffId, startsAt, endsAt)) {
      return res.status(409).json({ error: "Este profissional já tem outro atendimento nesse horário", code: "BEAUTY_APPOINTMENT_CONFLICT" });
    }
    res.status(201).json(insertAppointment({ ...req.body, endsAt }, req.user.id));
  })
);
router.patch(
  "/appointments/:id/status",
  ah(async (req, res) => {
    const { status } = req.body || {};
    if (!["agendado", "concluido", "cancelado"].includes(status)) {
      return res.status(400).json({ error: "Situação inválida", code: "BEAUTY_STATUS_INVALID" });
    }
    const atualizado = setAppointmentStatus(req.params.id, status);
    if (!atualizado) return res.status(404).json({ error: "Agendamento não encontrado", code: "BEAUTY_APPOINTMENT_NOT_FOUND" });
    res.json(atualizado);
  })
);

// ---------- Profissionais + financeiro (Fase 2, Premium+) ----------

router.get("/staff", exigeBeautyFinance, ah(async (req, res) => res.json(listStaff())));
router.post(
  "/staff",
  exigeBeautyFinance,
  ah(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Informe o nome do profissional", code: "BEAUTY_STAFF_NAME_REQUIRED" });
    }
    res.status(201).json(insertStaff({ ...req.body, name: name.trim() }));
  })
);
router.patch(
  "/staff/:id",
  exigeBeautyFinance,
  ah(async (req, res) => {
    const atualizado = updateStaff(req.params.id, req.body || {});
    if (!atualizado) return res.status(404).json({ error: "Profissional não encontrado", code: "BEAUTY_STAFF_NOT_FOUND" });
    res.json(atualizado);
  })
);
router.delete(
  "/staff/:id",
  exigeBeautyFinance,
  ah(async (req, res) => {
    const ok = deactivateStaff(req.params.id);
    if (!ok) return res.status(404).json({ error: "Profissional não encontrado", code: "BEAUTY_STAFF_NOT_FOUND" });
    res.json({ ok: true });
  })
);

router.get(
  "/payments",
  exigeBeautyFinance,
  ah(async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "Informe o período (from/to)", code: "BEAUTY_PERIOD_REQUIRED" });
    }
    res.json(listPayments(from, to));
  })
);
router.post(
  "/payments",
  exigeBeautyFinance,
  ah(async (req, res) => {
    const { appointmentId, amountCents } = req.body || {};
    if (!appointmentId || !getAppointment(appointmentId)) {
      return res.status(400).json({ error: "Agendamento inválido", code: "BEAUTY_APPOINTMENT_NOT_FOUND" });
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: "Informe o valor pago", code: "BEAUTY_AMOUNT_REQUIRED" });
    }
    res.status(201).json(insertPayment(req.body, req.user.id));
  })
);

router.get(
  "/commissions",
  exigeBeautyFinance,
  ah(async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "Informe o período (from/to)", code: "BEAUTY_PERIOD_REQUIRED" });
    }
    res.json(getCommissionsSummary(from, to));
  })
);

// Comissão por serviço (Fase 7) - override opcional por cima do padrão do
// profissional. Rota fixa "/commissions/overrides", não colide com
// GET /commissions acima (caminho diferente, não é parâmetro).
router.get(
  "/commissions/overrides",
  exigeBeautyFinance,
  ah(async (req, res) => {
    res.json(listCommissionOverrides());
  })
);
router.put(
  "/commissions/overrides",
  exigeBeautyFinance,
  ah(async (req, res) => {
    const { staffId, serviceId, commissionRate } = req.body || {};
    if (!staffId || !getStaffMember(staffId)) {
      return res.status(400).json({ error: "Profissional inválido", code: "BEAUTY_STAFF_NOT_FOUND" });
    }
    if (!serviceId || !getService(serviceId)) {
      return res.status(400).json({ error: "Serviço inválido", code: "BEAUTY_SERVICE_NOT_FOUND" });
    }
    if (typeof commissionRate !== "number" || commissionRate < 0 || commissionRate > 1) {
      return res.status(400).json({ error: "Informe uma comissão entre 0% e 100%", code: "BEAUTY_COMMISSION_RATE_INVALID" });
    }
    setCommissionOverride(staffId, serviceId, commissionRate);
    res.status(201).json(listCommissionOverrides());
  })
);
router.delete(
  "/commissions/overrides/:staffId/:serviceId",
  exigeBeautyFinance,
  ah(async (req, res) => {
    const ok = removeCommissionOverride(req.params.staffId, req.params.serviceId);
    if (!ok) return res.status(404).json({ error: "Comissão não encontrada", code: "BEAUTY_COMMISSION_OVERRIDE_NOT_FOUND" });
    res.json({ ok: true });
  })
);

// Dashboard financeiro (Fase 7): donut por método de pagamento e balanço
// mensal (faturamento x comissão devida) no ano inteiro.
router.get(
  "/revenue-by-method",
  exigeBeautyFinance,
  ah(async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "Informe o período (from/to)", code: "BEAUTY_PERIOD_REQUIRED" });
    }
    res.json(getRevenueByMethod(from, to));
  })
);
router.get(
  "/monthly-summary",
  exigeBeautyFinance,
  ah(async (req, res) => {
    const ano = Number(req.query.year) || new Date().getFullYear();
    res.json(getMonthlyFinanceSummary(ano));
  })
);

// ---------- Link público de agendamento (Fase 4, Profissional+) ----------
// A rota que o VISITANTE usa é pública (server/routes/xaphiresBeautyPublica.js,
// fora de requireAuth). Esta aqui é só para o dono do salão gerar/ver o
// próprio link, por isso continua atrás de requireAuth + exigeBeautyOnlineBooking.

router.get(
  "/booking-link",
  exigeBeautyOnlineBooking,
  ah(async (req, res) => {
    res.json({ slug: getOuCriarSlugAgendamento(req.companyId) });
  })
);

export { router };
