import { Router } from "express";
import { requireAuth, requireMaster } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import { getCompany, setCompanyPlan } from "../directory.js";
import { countUsers, countBoards } from "../repo.js";
import {
  PLANS,
  PLAN_IDS,
  getPlan,
  effectiveStatus,
  daysLeft,
  canSelfSelectPlan,
  canUseAutoArchive,
  canUseBottleneckMonitor,
  canUseTaskTicker,
  canUsePersonalPlanner,
  attachmentLimitFor,
  maxUsersFor,
  maxBoardsFor,
  canAddBoard,
  viewsFor,
} from "../plans.js";

const router = Router();
router.use(requireAuth);

// Desconto líquido de um plano: nunca deixa o preço negativo, e sob consulta
// (priceCents null, hoje só o Empresarial) não desconta nada, porque não há
// tabela para descontar em cima. Mesma trava de emitirCobranca em
// billing/lifecycle.js, para o valor mostrado aqui nunca destoar do que a
// cobrança de verdade vai cobrar.
function precoComDesconto(planId, discountCents) {
  const centavos = PLANS[planId].priceCents;
  if (centavos === null) return null;
  return (centavos - Math.min(discountCents, centavos)) / 100;
}

function resumo(companyId) {
  const company = getCompany(companyId);
  const plano = getPlan(company?.plan);
  const usuarios = countUsers();
  const maxUsers = maxUsersFor(company);
  const quadros = countBoards();
  const maxBoards = maxBoardsFor(company);
  const discountCents = company?.discount_cents || 0;
  return {
    plan: company?.plan || "basic",
    status: effectiveStatus(company),
    contractedAt: company?.contracted_at || null,
    expiresAt: company?.expires_at || null,
    daysLeft: daysLeft(company),
    // price já vem líquido de desconto - é o que a empresa paga de fato. listPrice
    // é o valor de tabela, sem desconto, só para a tela poder mostrar os dois.
    price: precoComDesconto(company?.plan || "basic", discountCents),
    listPrice: plano.price,
    discountCents,
    userCount: usuarios,
    maxUsers,
    canAddUser: maxUsers === null || usuarios < maxUsers,
    boardCount: quadros,
    maxBoards,
    canAddBoard: canAddBoard(company, quadros),
    views: viewsFor(company?.plan),
    canUseAutoArchive: canUseAutoArchive(company?.plan),
    canUseBottleneckMonitor: canUseBottleneckMonitor(company?.plan),
    canUseTaskTicker: canUseTaskTicker(company?.plan),
    canUsePersonalPlanner: canUsePersonalPlanner(company?.plan),
    maxAttachmentBytes: attachmentLimitFor(company),
    // Catálogo com a decisão de autoatendimento já resolvida no servidor, para o
    // cliente não reimplementar a regra e as duas pontas discordarem. price aqui
    // também já é líquido de desconto, para o botão de trocar de plano e o
    // checkout mostrarem o valor que será cobrado de verdade.
    catalog: PLAN_IDS.map((id) => ({
      id,
      price: precoComDesconto(id, discountCents),
      listPrice: PLANS[id].price,
      maxUsers: PLANS[id].maxUsers,
      paid: PLANS[id].paid,
      current: id === (company?.plan || "basic"),
      selfSelectable: canSelfSelectPlan(company, id),
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
    // Com plano pago em vigor, descer por um clique não pode: pagar menos no meio
    // do ciclo passa por quem cobra. Vencido ou no gratuito, a escolha é livre.
    if (!canSelfSelectPlan(company, plan)) {
      return res.status(403).json({
        error: "Só é possível subir de plano por aqui. Para descer ou cancelar, fale com o suporte.",
        code: "PLAN_DOWNGRADE_NOT_SELF_SERVICE",
      });
    }

    const alvo = getPlan(plan);

    // Plano pago NÃO é concedido por aqui. Esta rota gravava status active e
    // vencimento um mês adiante sem nenhuma cobrança: bastava clicar para ter o
    // Profissional de graça, indefinidamente. Contratar plano pago passa por
    // POST /api/billing/subscribe, e o acesso só muda quando o pagamento é
    // confirmado. Aqui fica apenas a troca para plano gratuito, que não cobra nada.
    if (alvo.paid) {
      return res.status(400).json({
        error: "Contratar um plano pago passa pelo pagamento.",
        code: "PLAN_REQUIRES_PAYMENT",
      });
    }

    // Daqui para baixo o plano é sempre gratuito, então não há limite de usuários a
    // conferir: quem passou do limite durante o teste precisa poder cair para o
    // Básico, senão fica preso em somente-leitura para sempre. Os usuários que já
    // existem continuam; criar novos é que fica travado, pelo canAddUser.
    //
    // Vencimento nulo porque o gratuito não expira — gravar uma data aqui faria o
    // effectiveStatus expirar mais tarde uma empresa que não deve mais nada.
    setCompanyPlan(req.companyId, {
      plan,
      status: "active",
      contractedAt: new Date().toISOString(),
      expiresAt: null,
    });
    res.json(resumo(req.companyId));
  })
);

export { router };
