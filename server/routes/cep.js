import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { rateLimit } from "../rateLimit.js";

const router = Router();
router.use(requireAuth);

// Busca de endereço por CEP no ViaCEP (público, gratuito). Proxy no servidor, pelo
// mesmo motivo do geocode: quem aparece lá é o IP da instância, não o do usuário -
// sem um teto aqui, um cliente em laço leva a instância inteira a ser bloqueada.
const cepLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  keyFn: (req) => req.user?.id || req.ip,
  message: "Muitas buscas de CEP em pouco tempo. Aguarde um instante e tente de novo.",
  code: "TOO_MANY_CEP_REQUESTS",
});

router.get("/:cep", cepLimit, async (req, res) => {
  const cep = String(req.params.cep || "").replace(/\D/g, "");
  if (cep.length !== 8) return res.status(400).json({ error: "CEP inválido", code: "CEP_INVALID" });
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { "User-Agent": "cantiere-app/1.0 (local self-hosted instance)" },
    });
    if (!resp.ok) throw new Error(`ViaCEP respondeu ${resp.status}`);
    const d = await resp.json();
    // O ViaCEP responde 200 com { erro: true } quando o CEP não existe.
    if (d.erro) return res.status(404).json({ error: "CEP não encontrado", code: "CEP_NOT_FOUND" });
    res.json({
      cep: d.cep || cep,
      logradouro: d.logradouro || "",
      complemento: d.complemento || "",
      bairro: d.bairro || "",
      cidade: d.localidade || "",
      uf: d.uf || "",
    });
  } catch {
    res.status(502).json({ error: "Não foi possível buscar o CEP agora. Tente novamente.", code: "CEP_UNAVAILABLE" });
  }
});

export { router };
