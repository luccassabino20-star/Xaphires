import { Router } from "express";
import { requireAuth, requireMaster } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import { getCompany, setCompanyPlan } from "../directory.js";
import { countUsers } from "../repo.js";
import {
  PLANS,
  PLAN_IDS,
  getPlan,
  effectiveStatus,
  daysLeft,
  canSelfUpgradeTo,
  canUseAutoArchive,
  canUseBottleneckMonitor,
  addOneMonth,
} from "../plans.js";

const router = Router();
router.use(requireAuth);

function resumo(companyId) {
  const company = getCompany(companyId);
  const plano = getPlan(company?.plan);
  const usuarios = countUsers();
  return {
    plan: company?.plan || "basic",
    status: effectiveStatus(company),
    contractedAt: company?.contracted_at || null,
    expiresAt: company?.expires_at || null,
    daysLeft: daysLeft(company),
    price: plano.price,
    userCount: usuarios,
    maxUsers: plano.maxUsers,
    canAddUser: plano.maxUsers === null || usuarios < plano.maxUsers,
    canUseAutoArchive: canUseAutoArchive(company?.plan),
    canUseBottleneckMonitor: canUseBottleneckMonitor(company?.plan),
    // Catálogo com a decisão de autoatendimento já resolvida no servidor, para o
    // cliente não reimplementar a regra e as duas pontas discordarem.
    catalog: PLAN_IDS.map((id) => ({
      id,
      price: PLANS[id].price,
      maxUsers: PLANS[id].maxUsers,
      current: id === (company?.plan || "basic"),
      selfUpgradable: canSelfUpgradeTo(company?.plan, id),
    })),
  };
}

router.get(
  "/",
  ah(async (req, res) => {
    res.json(resumo(req.companyId));
  })
);

router.post(
  "/",
  requireMaster,
  ah(async (req, res) => {
    const { plan } = req.body || {};
    if (!PLAN_IDS.includes(plan)) {
      return res.status(400).json({ error: "Plano inválido", code: "INVALID_PLAN" });
    }

    const company = getCompany(req.companyId);
    // Descer de plano significa pagar menos e cancelar significa parar de pagar;
    // nenhum dos dois pode acontecer por um clique sem passar por quem cobra.
    if (!canSelfUpgradeTo(company?.plan, plan)) {
      return res.status(403).json({
        error: "Só é possível subir de plano por aqui. Para descer ou cancelar, fale com o suporte.",
        code: "PLAN_DOWNGRADE_NOT_SELF_SERVICE",
      });
    }

    const usuarios = countUsers();
    const limite = getPlan(plan).maxUsers;
    if (limite !== null && usuarios > limite) {
      return res.status(400).json({
        error: `O plano escolhido permite ${limite} usuários e a empresa tem ${usuarios}.`,
        code: "PLAN_USER_LIMIT_EXCEEDED",
        userCount: usuarios,
        maxUsers: limite,
      });
    }

    // Contratar reinicia o ciclo: vale a partir de agora e vence daqui a um mês.
    const agora = new Date().toISOString();
    setCompanyPlan(req.companyId, {
      plan,
      status: "active",
      contractedAt: agora,
      expiresAt: addOneMonth(agora),
    });
    res.json(resumo(req.companyId));
  })
);

export { router };
