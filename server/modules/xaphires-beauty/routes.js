import { Router } from "express";
import { requireAuth, requireWritablePlan, requireModule } from "../../middleware.js";
import { ah } from "../../asyncHandler.js";
import { getCompany } from "../../directory.js";
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
} from "./repo.js";
import { getOuCriarSlugAgendamento } from "./agendaSlugStore.js";

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
