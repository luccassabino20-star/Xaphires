// Conexão de WhatsApp por empresa (Financeiro → Cobranças → Configurações).
// Ver server/services/whatsappService.js para o porquê disto ser whatsapp-web.js
// (automação não-oficial) e não a API de Negócios da Meta - decisão do produto,
// com o risco de banimento documentado lá.
import { Router } from "express";
import { requireAuth, requireWritablePlan, requireModule } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import * as whatsapp from "../services/whatsappService.js";

const router = Router();
// Mesma régua de acesso do resto do Financeiro: precisa do módulo e de plano
// que ainda escreve (conectar/enviar são ações, não seriam liberadas pra quem
// já venceu) - GET /status continua liberado por ser leitura.
router.use(requireAuth, requireWritablePlan, requireModule("financeiro"));

router.get("/status", ah(async (req, res) => {
  res.json(whatsapp.getStatus(req.companyId));
}));

// Existe separado de /status porque o pedido original especificava assim; na
// prática /status já devolve o qr quando o estágio é SCAN_QR.
router.get("/qr", ah(async (req, res) => {
  const estado = whatsapp.getStatus(req.companyId);
  if (!estado.qr) return res.status(404).json({ error: "QR Code indisponível", code: "WHATSAPP_QR_NOT_AVAILABLE" });
  res.json({ qr: estado.qr });
}));

router.post("/connect", ah(async (req, res) => {
  res.json(await whatsapp.connect(req.companyId));
}));

router.post("/disconnect", ah(async (req, res) => {
  res.json(await whatsapp.disconnect(req.companyId));
}));

router.post("/send-message", ah(async (req, res) => {
  const { phone, text } = req.body || {};
  if (!phone || !text?.trim()) {
    return res.status(400).json({ error: "Informe telefone e mensagem", code: "WHATSAPP_MESSAGE_INVALID" });
  }
  try {
    await whatsapp.sendMessage(req.companyId, phone, text.trim());
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "WHATSAPP_NOT_READY" || err.code === "WHATSAPP_PHONE_INVALID") {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    throw err;
  }
}));

export { router };
