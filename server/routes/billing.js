import { Router } from "express";
import { requireAuth, requireMaster } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import { getCompany } from "../directory.js";
import { countUsers } from "../repo.js";
import { docValido, normalizarDoc } from "../doc.js";
import { canSelfSelectPlan, getPlan, priceCentsOf } from "../plans.js";
import { metodoValido, METODOS, gateway } from "../billing/gateway.js";
import * as store from "../billing/store.js";
import * as ciclo from "../billing/lifecycle.js";

const router = Router();
router.use(requireAuth);

// `ehMaster` controla o documento do pagador: serve para preencher o campo numa
// renovação, mas é dado pessoal de quem contratou e não tem por que aparecer para
// os demais membros da empresa.
function visaoAssinatura(row, ehMaster = false) {
  if (!row) return null;
  return {
    id: row.id,
    plan: row.plan,
    method: row.method,
    status: row.status,
    nextChargeAt: row.next_charge_at,
    canceledAt: row.canceled_at,
    createdAt: row.created_at,
    payerDoc: ehMaster ? row.payer_doc || null : null,
  };
}

// Estado da cobrança da empresa: assinatura, cobrança em aberto e extrato.
router.get(
  "/",
  ah(async (req, res) => {
    const pendente = store.pendingPayment(req.companyId);
    res.json({
      methods: METODOS,
      // O cliente precisa saber que está no provedor simulado para só então mostrar
      // campo de número de cartão. Com provedor real, o cartão é pago numa página
      // hospedada pelo próprio gateway (ver providers/asaas.js) — o número nunca
      // chega no nosso servidor nem no nosso JavaScript.
      simulated: gateway.nome === "fake",
      provider: gateway.nome,
      subscription: visaoAssinatura(store.getActiveSubscription(req.companyId), req.user.role === "master"),
      pendingPayment: store.publicPayment(pendente),
      payments: store.listPayments(req.companyId).map(store.publicPayment),
      graceUntil: getCompany(req.companyId)?.grace_until || null,
    });
  })
);

// Confere no gateway se uma cobrança pendente já foi paga. O cliente chama isto ao
// abrir a tela de pagamento e ao voltar do checkout: webhook perdido é comum, e sem
// esta conferência o cliente pagaria e ficaria esperando.
router.post(
  "/payments/:id/check",
  ah(async (req, res) => {
    const pagamento = store.getPayment(req.params.id);
    // Confere o dono antes de qualquer coisa: id de pagamento não pode servir para
    // olhar cobrança de outra empresa.
    if (!pagamento || pagamento.company_id !== req.companyId) {
      return res.status(404).json({ error: "Cobrança não encontrada", code: "PAYMENT_NOT_FOUND" });
    }
    res.json({ payment: store.publicPayment(await ciclo.conferirPagamento(req.params.id)) });
  })
);

// Contrata um plano pago. Só o master, porque gera cobrança.
router.post(
  "/subscribe",
  requireMaster,
  ah(async (req, res) => {
    const { plan, method, card } = req.body || {};
    const empresa = getCompany(req.companyId);

    // Pagar pelo plano que já se tem é sempre permitido: é renovação, e o ciclo novo
    // começa no fim do atual, então não se perde dia nenhum. A regra de "só subir"
    // existe para troca de plano, não para o cliente quitar o próprio.
    const mesmoPlano = plan === (empresa?.plan || "basic");
    if (!mesmoPlano && !canSelfSelectPlan(empresa, plan)) {
      return res.status(403).json({
        error: "Esse plano não pode ser contratado por aqui.",
        code: "PLAN_DOWNGRADE_NOT_SELF_SERVICE",
      });
    }
    if (!getPlan(plan).paid) {
      return res.status(400).json({
        error: "Plano gratuito não passa por cobrança. Use a troca de plano.",
        code: "PLAN_NOT_CHARGEABLE",
      });
    }
    if (priceCentsOf(plan) === null) {
      return res.status(400).json({ error: "Plano sob consulta", code: "PLAN_NOT_CHARGEABLE" });
    }
    if (!metodoValido(method)) {
      return res.status(400).json({ error: "Escolha uma forma de pagamento", code: "INVALID_PAYMENT_METHOD" });
    }

    // Pix e boleto exigem CPF ou CNPJ do pagador no Brasil. Conferido aqui com
    // dígito verificador de verdade: documento com erro de digitação volta do
    // gateway como 400 genérico que ninguém consegue interpretar na tela.
    const docPagador = normalizarDoc(req.body?.payerDoc);
    if (method === "pix" || method === "boleto") {
      if (!docPagador) {
        return res.status(400).json({ error: "Informe o CPF ou CNPJ do pagador", code: "PAYER_DOCUMENT_REQUIRED" });
      }
      if (!docValido(docPagador)) {
        return res.status(400).json({ error: "CPF ou CNPJ inválido", code: "PAYER_DOCUMENT_INVALID" });
      }
    }

    // Mesma regra da troca de plano: não deixa contratar um plano pago apertado
    // demais para a equipe atual, senão a empresa pagaria por algo que já nasce
    // bloqueado. countUsers() lê o banco da empresa, e o contexto vem do requireAuth.
    // A exceção administrativa da empresa (max_users_override) vale por cima do
    // teto do plano escolhido, porque é da empresa, não do plano - trocar de plano
    // não devolve o teto ao padrão sozinho.
    const limite = empresa?.max_users_override ?? getPlan(plan).maxUsers;
    const usuarios = await countUsers();
    if (limite !== null && usuarios > limite) {
      return res.status(400).json({
        error: `O plano escolhido permite ${limite} usuários e a empresa tem ${usuarios}.`,
        code: "PLAN_USER_LIMIT_EXCEEDED",
        userCount: usuarios,
        maxUsers: limite,
      });
    }

    try {
      // O pagador sai da sessão, não do corpo: e-mail de cobrança não é campo que o
      // cliente escolhe. O documento vem do formulário porque não temos CPF/CNPJ no
      // cadastro.
      const payer = { email: req.user.email, name: req.user.name, doc: docPagador || null };
      const r = await ciclo.assinar({ companyId: req.companyId, plan, method, card, payer });
      res.status(201).json({
        subscription: visaoAssinatura(r.subscription),
        payment: store.publicPayment(r.payment),
      });
    } catch (err) {
      if (err.code === "PAYMENT_ALREADY_PENDING") {
        return res.status(409).json({
          error: err.message,
          code: err.code,
          payment: store.publicPayment(err.payment),
        });
      }
      if (err.code === "CARD_DECLINED") {
        return res.status(402).json({ error: err.message, code: err.code, failureReason: err.failureReason });
      }
      if (err.code === "BILLING_PROVIDER_NOT_CONFIGURED" || err.code === "GATEWAY_ERROR") {
        return res.status(503).json({ error: err.message, code: "BILLING_PROVIDER_NOT_CONFIGURED" });
      }
      // Dados do pagador que o gateway exige e não temos. Código próprio para a tela
      // poder pedir exatamente o que falta, em vez de mostrar erro genérico.
      if (err.code === "PAYER_DOCUMENT_REQUIRED" || err.code === "PAYER_EMAIL_REQUIRED" || err.code === "CARD_TOKEN_REQUIRED") {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  })
);

// Troca a forma de pagamento da assinatura, SEM cobrar nada agora. É operação de
// cadastro, não renovação antecipada: o meio novo vale a partir do próximo ciclo.
// Sem esta rota, um cliente com cartão vencido não teria como consertar — assinar de
// novo o mesmo plano cobraria na hora, o que não é o que ele pediu.
router.put(
  "/method",
  requireMaster,
  ah(async (req, res) => {
    const { method, card } = req.body || {};
    if (!metodoValido(method)) {
      return res.status(400).json({ error: "Escolha uma forma de pagamento", code: "INVALID_PAYMENT_METHOD" });
    }
    const assinatura = store.getActiveSubscription(req.companyId);
    if (!assinatura) return res.status(404).json({ error: "Sem assinatura ativa", code: "NO_SUBSCRIPTION" });

    try {
      const atualizada = await ciclo.trocarMetodo(assinatura.id, method, card);
      res.json({ subscription: visaoAssinatura(atualizada) });
    } catch (err) {
      if (err.code === "CARD_DECLINED") {
        return res.status(402).json({ error: err.message, code: err.code, failureReason: err.failureReason });
      }
      if (err.code === "BILLING_PROVIDER_NOT_CONFIGURED") {
        return res.status(503).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  })
);

// Confirma uma cobrança à mão. SÓ existe no provedor simulado, e é o que permite
// exercitar o fluxo de Pix e boleto no navegador em desenvolvimento — sem ela não há
// como um Pix simulado sair de pendente, porque quem confirma no mundo real é o
// banco. Com provedor real esta rota responde 404, então não há como usá-la para
// liberar plano sem pagar.
router.post(
  "/dev/confirm/:id",
  requireMaster,
  ah(async (req, res) => {
    if (gateway.nome !== "fake") {
      return res.status(404).json({ error: "Indisponível", code: "NOT_FOUND" });
    }
    const pagamento = store.getPayment(req.params.id);
    if (!pagamento || pagamento.company_id !== req.companyId) {
      return res.status(404).json({ error: "Cobrança não encontrada", code: "PAYMENT_NOT_FOUND" });
    }
    res.json({ payment: store.publicPayment(ciclo.confirmarPagamento(req.params.id)) });
  })
);

// Cancela a renovação. O acesso já pago continua até o fim do ciclo.
router.post(
  "/cancel",
  requireMaster,
  ah(async (req, res) => {
    const assinatura = await ciclo.cancelarAssinatura(req.companyId);
    if (!assinatura) return res.status(404).json({ error: "Sem assinatura ativa", code: "NO_SUBSCRIPTION" });
    res.json({ subscription: visaoAssinatura(assinatura) });
  })
);

export { router };
