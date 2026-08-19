// Formulário de pré-anamnese que o PACIENTE preenche pelo celular, a partir de
// um link mandado por WhatsApp (server/modules/saude-clinicas/routes.js
// /anamnesis-responses/:id/enviar gera o token). Sem sessão nenhuma - por
// isso entra manualmente no runWithCompany, o mesmo escape do ALS que o
// upload de anexo em routes/cards.js já faz.
//
// Montada em app.js ANTES do verifyOrigin, junto do webhook de cobrança: o
// navegador do paciente, aberto de dentro do app do WhatsApp, pode não mandar
// Origin/Referer, e não há cookie de sessão para o CSRF proteger aqui de
// qualquer forma.
import { Router } from "express";
import { ah } from "../asyncHandler.js";
import { getCompany } from "../directory.js";
import { runWithCompany } from "../context.js";
import { getRespostaPorToken, getAnamneseTemplate, getPatient, responderAnamnese } from "../modules/saude-clinicas/repo.js";
import { rateLimit } from "../rateLimit.js";

const router = Router();

// Mesma janela do login: um token é só 24 bytes aleatórios (base64url), mas
// nada custa limitar a varredura por força bruta a partir de um IP.
const limitePublico = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyFn: (req) => `anamnese-publica:${req.ip}`,
  message: "Muitas tentativas. Aguarde alguns minutos.",
  code: "TOO_MANY_REQUESTS",
});

function parseFields(fields) {
  try {
    return typeof fields === "string" ? JSON.parse(fields) : fields;
  } catch {
    return [];
  }
}

router.get(
  "/:companyId/:token",
  limitePublico,
  ah(async (req, res) => {
    const { companyId, token } = req.params;
    // Mesma cautela do requireAuth: confere a empresa ANTES de entrar no
    // contexto, para não ressuscitar a pasta de uma empresa apagada.
    if (!getCompany(companyId)) {
      return res.status(404).json({ error: "Link inválido", code: "ANAMNESE_TOKEN_INVALIDO" });
    }
    runWithCompany(companyId, () => {
      const resposta = getRespostaPorToken(token);
      if (!resposta) return res.status(404).json({ error: "Link inválido ou expirado", code: "ANAMNESE_TOKEN_INVALIDO" });
      if (resposta.status === "respondido") {
        return res.status(409).json({ error: "Esta ficha já foi respondida", code: "ANAMNESE_JA_RESPONDIDA" });
      }
      const template = getAnamneseTemplate(resposta.template_id);
      const paciente = getPatient(resposta.patient_id);
      res.json({
        patientName: paciente?.name || "",
        templateName: template?.name || "",
        fields: parseFields(template?.fields),
      });
    });
  })
);

router.post(
  "/:companyId/:token",
  limitePublico,
  ah(async (req, res) => {
    const { companyId, token } = req.params;
    if (!getCompany(companyId)) {
      return res.status(404).json({ error: "Link inválido", code: "ANAMNESE_TOKEN_INVALIDO" });
    }
    runWithCompany(companyId, () => {
      const atual = getRespostaPorToken(token);
      if (!atual) return res.status(404).json({ error: "Link inválido ou expirado", code: "ANAMNESE_TOKEN_INVALIDO" });
      if (atual.status === "respondido") {
        return res.status(409).json({ error: "Esta ficha já foi respondida", code: "ANAMNESE_JA_RESPONDIDA" });
      }
      responderAnamnese(token, req.body?.answers || {});
      res.json({ ok: true });
    });
  })
);

export { router };
