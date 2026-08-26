// Formulário de agendamento que o VISITANTE preenche pelo celular, a partir
// do link fixo do salão (Fase 4 do módulo Xaphires Beauty). Sem sessão
// nenhuma - por isso entra manualmente no runWithCompany, o mesmo escape do
// ALS que anamnesePublica.js já faz.
//
// Montada em app.js ANTES do verifyOrigin, junto do webhook de cobrança e da
// anamnese pública: o navegador do visitante pode não mandar Origin/Referer,
// e não há cookie de sessão para o CSRF proteger aqui de qualquer forma.
import { Router } from "express";
import { ah } from "../asyncHandler.js";
import { getCompany } from "../directory.js";
import { runWithCompany } from "../context.js";
import { canUseBeautyOnlineBooking } from "../plans.js";
import {
  listServices,
  listStaff,
  getService,
  getStaffMember,
  findClientByPhone,
  insertClient,
  insertAppointment,
  hasOverlap,
  somarMinutosLocal,
  getPageConfig,
  getPageImageFile,
} from "../modules/xaphires-beauty/repo.js";
import { getAgendamentoPorSlug } from "../modules/xaphires-beauty/agendaSlugStore.js";
import { rateLimit } from "../rateLimit.js";

const router = Router();

// Mesma janela da captação de anamnese: limita a varredura por força bruta
// a partir de um IP.
const limitePublico = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyFn: (req) => `beauty-agendar:${req.ip}`,
  message: "Muitas tentativas. Aguarde alguns minutos.",
  code: "TOO_MANY_REQUESTS",
});

// Resolve o slug para uma empresa que existe E que ainda tem direito ao
// recurso - empresa que caiu de plano depois de ter gerado o link não deixa
// o link morto voltando 500 nem servindo o formulário: volta 404, igual
// link de empresa apagada.
function resolverEmpresa(req, res) {
  const alvo = getAgendamentoPorSlug(req.params.slug);
  const company = alvo && getCompany(alvo.company_id);
  if (!alvo || !company || !canUseBeautyOnlineBooking(company.plan)) {
    res.status(404).json({ error: "Link inválido", code: "BEAUTY_BOOKING_LINK_INVALIDO" });
    return null;
  }
  return alvo.company_id;
}

router.get(
  "/:slug",
  limitePublico,
  ah(async (req, res) => {
    const companyId = resolverEmpresa(req, res);
    if (!companyId) return;
    runWithCompany(companyId, () => {
      const config = getPageConfig();
      res.json({
        companyName: getCompany(companyId)?.name || "",
        services: listServices().map((s) => ({ id: s.id, name: s.name, durationMinutes: s.duration_minutes, priceCents: s.price_cents })),
        staff: listStaff().map((s) => ({ id: s.id, name: s.name, role: s.role })),
        address: config.address,
        lat: config.lat,
        lng: config.lng,
        bookingRulesText: config.booking_rules_text,
        // O path em si (não um booleano) - o cliente usa como cache-bust na
        // URL da foto (?v=<path>), mesmo truque de avatar_path em clientes/
        // serviços: sem isso, trocar a capa não invalida o cache de quem já
        // abriu a página (Cache-Control é immutable de propósito).
        coverPath: config.cover_path,
        logoPath: config.logo_path,
      });
    });
  })
);

// Capa/logo personalizados (Fase 10) - mesma resolução de empresa por slug,
// sem sessão. Servida à parte da rota principal porque é imagem (Content-
// Type próprio), não JSON.
router.get(
  "/:slug/photo/:campo",
  limitePublico,
  ah(async (req, res) => {
    const companyId = resolverEmpresa(req, res);
    if (!companyId) return;
    const campo = req.params.campo;
    if (!["cover", "logo"].includes(campo)) {
      return res.status(400).json({ error: "Campo inválido", code: "BEAUTY_PAGE_FIELD_INVALID" });
    }
    runWithCompany(companyId, () => {
      const file = getPageImageFile(campo);
      if (!file) return res.status(404).json({ error: "Imagem não encontrada", code: "PHOTO_NOT_FOUND" });
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.sendFile(file.path);
    });
  })
);

router.post(
  "/:slug",
  limitePublico,
  ah(async (req, res) => {
    const companyId = resolverEmpresa(req, res);
    if (!companyId) return;
    runWithCompany(companyId, () => {
      const { name, phone, serviceId, staffId, startsAt } = req.body || {};
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Informe seu nome", code: "BEAUTY_NAME_REQUIRED" });
      }
      if (!phone || !phone.trim()) {
        return res.status(400).json({ error: "Informe seu telefone", code: "BEAUTY_PHONE_REQUIRED" });
      }
      const servico = serviceId && getService(serviceId);
      if (!servico) {
        return res.status(400).json({ error: "Serviço inválido", code: "BEAUTY_SERVICE_REQUIRED" });
      }
      if (staffId && !getStaffMember(staffId)) {
        return res.status(400).json({ error: "Profissional inválido", code: "BEAUTY_STAFF_NOT_FOUND" });
      }
      if (!startsAt || Number.isNaN(new Date(startsAt).getTime()) || new Date(startsAt) < new Date()) {
        return res.status(400).json({ error: "Escolha uma data e hora válidas", code: "BEAUTY_STARTS_AT_REQUIRED" });
      }
      const endsAt = somarMinutosLocal(startsAt, servico.duration_minutes);
      if (hasOverlap(staffId, startsAt, endsAt)) {
        return res.status(409).json({ error: "Esse horário acabou de ser preenchido, escolha outro", code: "BEAUTY_APPOINTMENT_CONFLICT" });
      }
      const cliente = findClientByPhone(phone.trim()) || insertClient({ name: name.trim(), phone: phone.trim() }, null);
      insertAppointment({ clientId: cliente.id, serviceId, staffId: staffId || null, startsAt, endsAt, fromPublicLink: true }, null);
      res.json({ ok: true });
    });
  })
);

export { router };
