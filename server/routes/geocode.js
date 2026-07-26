import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { rateLimit } from "../rateLimit.js";

const router = Router();
router.use(requireAuth);

// O Nominatim é um serviço público de uso gratuito e com limite de volume. Quem
// aparece lá é o IP do nosso servidor, não o do usuário: sem um teto aqui, um
// cliente em laço leva a instância inteira a ser bloqueada por lá.
const geocodeLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 40,
  keyFn: (req) => req.user?.id || req.ip,
  message: "Muitas buscas de endereço em pouco tempo. Aguarde um instante e tente de novo.",
  code: "TOO_MANY_GEOCODE_REQUESTS",
});

router.get("/", geocodeLimit, async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ error: "Informe um endereço para buscar", code: "ADDRESS_REQUIRED" });

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "cantiere-app/1.0 (local self-hosted instance)" },
    });
    if (!resp.ok) throw new Error(`Nominatim respondeu ${resp.status}`);
    const results = await resp.json();
    if (!results.length) return res.status(404).json({ error: "Endereço não encontrado", code: "ADDRESS_NOT_FOUND" });
    const { lat, lon, display_name } = results[0];
    res.json({ lat: parseFloat(lat), lng: parseFloat(lon), displayName: display_name });
  } catch (err) {
    res.status(502).json({ error: "Não foi possível buscar o endereço agora. Tente novamente.", code: "GEOCODE_UNAVAILABLE" });
  }
});

export { router };
