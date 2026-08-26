import { Router } from "express";
import { requireAuth, requireWritablePlan, requireModule } from "../../middleware.js";
import { ah } from "../../asyncHandler.js";
import { getSummary } from "./repo.js";

const router = Router();
// Mesma camada tripla dos outros módulos add-on (ver saude-clinicas/
// routes.js): requireAuth resolve o companyId/ALS; requireWritablePlan tira
// a escrita de quem venceu o plano; requireModule barra quem não tem o
// módulo contratado. Rota nova aqui nasce protegida.
router.use(requireAuth, requireWritablePlan, requireModule("xaphires-beauty"));

router.get(
  "/config",
  ah(async (req, res) => {
    res.json(getSummary());
  })
);

export { router };
