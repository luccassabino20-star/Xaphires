// Link de lembrete por agendamento (Fase 9 do módulo Xaphires Beauty) - o
// CLIENTE abre pra conferir data/hora/serviço do próprio atendimento, sem
// login e sem edição nenhuma (mesmo isolamento de xaphiresBeautyPublica.js,
// e mesmo escape do ALS via runWithCompany porque a rota nasce fora de
// requireAuth). Só GET, então nem precisaria vir antes do verifyOrigin em
// app.js (SAFE_METHODS já libera GET ali) - mas fica junto dos outros
// públicos por organização.
import { Router } from "express";
import { ah } from "../asyncHandler.js";
import { getCompany } from "../directory.js";
import { runWithCompany } from "../context.js";
import { getAppointment } from "../modules/xaphires-beauty/repo.js";
import { getLembretePorSlug } from "../modules/xaphires-beauty/reminderSlugStore.js";
import { rateLimit } from "../rateLimit.js";

const router = Router();

const limitePublico = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyFn: (req) => `beauty-lembrete:${req.ip}`,
  message: "Muitas tentativas. Aguarde alguns minutos.",
  code: "TOO_MANY_REQUESTS",
});

router.get(
  "/:slug",
  limitePublico,
  ah(async (req, res) => {
    const alvo = getLembretePorSlug(req.params.slug);
    const company = alvo && getCompany(alvo.company_id);
    if (!alvo || !company) {
      return res.status(404).json({ error: "Link inválido", code: "BEAUTY_REMINDER_LINK_INVALIDO" });
    }
    runWithCompany(alvo.company_id, () => {
      const agendamento = getAppointment(alvo.appointment_id);
      if (!agendamento) {
        return res.status(404).json({ error: "Link inválido", code: "BEAUTY_REMINDER_LINK_INVALIDO" });
      }
      res.json({
        companyName: company.name,
        clientName: agendamento.client_name,
        serviceName: agendamento.service_name,
        staffName: agendamento.staff_name,
        startsAt: agendamento.starts_at,
        status: agendamento.status,
      });
    });
  })
);

export { router };
