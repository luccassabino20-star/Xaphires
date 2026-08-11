import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import { getCompany } from "../directory.js";
import { moduleCatalogFor } from "../modules.js";

const router = Router();
router.use(requireAuth);

// Catálogo de módulos da plataforma já resolvido para a empresa. Fica fora do
// requireWritablePlan (montado sem ele em app.js, como /api/plan): empresa
// vencida precisa enxergar os módulos para navegar e pagar. É só leitura da
// autoridade em modules.js — nenhuma decisão de acesso mora no cliente.
router.get(
  "/",
  ah(async (req, res) => {
    const company = getCompany(req.companyId);
    res.json({ modules: moduleCatalogFor(company, req.user) });
  })
);

export { router };
