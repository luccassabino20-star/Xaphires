import { Router } from "express";
import { requireAuth } from "../middleware.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
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
