import { Router } from "express";
import { requireAuth, requireMaster } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import { getCompany, setCompanyPlan } from "../directory.js";
import { countUsers } from "../repo.js";
import { getPlan, effectiveStatus, daysLeft, PLAN_IDS } from "../plans.js";

const router = Router();
router.use(requireAuth);

function resumo(companyId) {
  const company = getCompany(companyId);
  const plano = getPlan(company?.plan);
  const usuarios = countUsers();
  return {
    plan: company?.plan || "basic",
    status: effectiveStatus(company),
    expiresAt: company?.expires_at || null,
    daysLeft: daysLeft(company),
    userCount: usuarios,
    maxUsers: plano.maxUsers,
    // Já resolvido aqui para o cliente não reimplementar a regra e as duas
    // pontas discordarem sobre quem pode adicionar usuário.
    canAddUser: plano.maxUsers === null || usuarios < plano.maxUsers,
  };
}

router.get(
  "/",
  ah(async (req, res) => {
    res.json(resumo(req.companyId));
  })
);

// Trocar de plano é ação do master. Sem cobrança automática ainda, então isto é o
// que permite ativar um cliente manualmente depois de receber por PIX ou boleto.
router.post(
  "/",
  requireMaster,
  ah(async (req, res) => {
    const { plan, expiresAt } = req.body || {};
    if (!PLAN_IDS.includes(plan)) {
      return res.status(400).json({ error: "Plano inválido", code: "INVALID_PLAN" });
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

    const pago = getPlan(plan).paid;
    setCompanyPlan(req.companyId, {
      plan,
      status: "active",
      // Plano gratuito não tem prazo; o pago sem data informada fica sem
      // vencimento até a cobrança automática existir para definir o ciclo.
      expiresAt: pago ? expiresAt ?? null : null,
    });
    res.json(resumo(req.companyId));
  })
);

export { router };
