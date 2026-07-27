import { Router } from "express";
import { ah } from "../asyncHandler.js";
import { rateLimit } from "../rateLimit.js";
import * as dir from "../directory.js";
import * as store from "../admin/store.js";
import { comAcessoAEmpresa, auditar } from "../admin/tenant.js";
import {
  requireAdmin,
  hashSenha,
  conferirSenha,
  assinarTokenAdmin,
  cookieOpts,
  COOKIE_ADMIN,
} from "../admin/auth.js";
import * as repo from "../repo.js";
import * as billing from "../billing/store.js";
import { PLAN_IDS, getPlan, effectiveStatus, daysLeft, addOneMonth } from "../plans.js";

const router = Router();

// Mais apertado que o login do app: são poucas contas, e cada uma abre todos os
// clientes. Cinco tentativas por quinze minutos.
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyFn: (req) => `admin:${req.ip}`,
  message: "Muitas tentativas. Aguarde alguns minutos.",
  code: "TOO_MANY_LOGIN_ATTEMPTS",
});

// ---------- Sessão ----------

router.post(
  "/login",
  limiteLogin,
  ah(async (req, res) => {
    const { email, password } = req.body || {};
    const admin = store.acharAdminPorEmail(email);
    // Mensagem única para e-mail inexistente, senha errada e conta desativada: sem
    // isso o painel vira um oráculo de quais e-mails são administradores.
    if (!admin || !admin.active || !conferirSenha(password || "", admin.password_hash)) {
      return res.status(401).json({ error: "Credenciais inválidas", code: "ADMIN_INVALID_CREDENTIALS" });
    }
    store.marcarLogin(admin.id);
    res.cookie(COOKIE_ADMIN, assinarTokenAdmin(admin), cookieOpts());
    limiteLogin.reset(req);
    store.registrar({ adminId: admin.id, adminEmail: admin.email, acao: "login", ip: req.ip });
    res.json(store.publicAdmin(admin));
  })
);

router.post("/logout", (req, res) => {
  const o = cookieOpts();
  res.clearCookie(COOKIE_ADMIN, { httpOnly: true, sameSite: o.sameSite, secure: o.secure, path: "/" });
  res.json({ ok: true });
});

router.get("/me", requireAdmin, (req, res) => res.json(store.publicAdmin(req.admin)));

// Tudo abaixo exige sessão de painel.
router.use(requireAdmin);

// ---------- Visão da empresa ----------

// Conta cartões, listas e quadros de uma empresa. Passa pelo caminho auditado
// porque abre o banco dela — mesmo sendo só contagem.
async function metricasDaEmpresa(req, companyId, acao = "ler_metricas") {
  return comAcessoAEmpresa(req, companyId, acao, async () => {
    const db = (await import("../db.js")).getDb();
    const q = (sql) => db.prepare(sql).get().c;
    return {
      usuarios: q("SELECT COUNT(*) c FROM users"),
      quadros: q("SELECT COUNT(*) c FROM boards"),
      listas: q("SELECT COUNT(*) c FROM lists"),
      cartoes: q("SELECT COUNT(*) c FROM cards WHERE archived = 0"),
      cartoesArquivados: q("SELECT COUNT(*) c FROM cards WHERE archived = 1"),
      atas: q("SELECT COUNT(*) c FROM minutes"),
      recorrencias: q("SELECT COUNT(*) c FROM recurrences"),
      anexos: db.prepare("SELECT COUNT(*) c FROM cards WHERE attachments != '[]'").get().c,
    };
  });
}

function visaoEmpresa(e) {
  const plano = getPlan(e.plan);
  return {
    id: e.id,
    name: e.name,
    plan: e.plan,
    planName: plano.id,
    maxUsers: plano.maxUsers,
    status: effectiveStatus(e),
    blocked: !!e.blocked_at,
    blockedAt: e.blocked_at,
    blockedReason: e.blocked_reason,
    expiresAt: e.expires_at,
    contractedAt: e.contracted_at,
    daysLeft: daysLeft(e),
    createdAt: e.created_at,
    contactName: e.contact_name,
    contactEmail: e.contact_email,
    contactPhone: e.contact_phone,
    doc: e.doc,
    notes: e.notes,
  };
}

router.get(
  "/companies",
  ah(async (req, res) => {
    const empresas = store.listarEmpresas();
    // A listagem não abre o banco de ninguém: só o diretório, que já é global. Por
    // isso não passa pelo caminho auditado — nenhum dado de cliente é lido aqui.
    res.json({
      companies: empresas.map((e) => ({
        ...visaoEmpresa(e),
        emails: store.emailsDaEmpresa(e.id),
        pagamentos: billing.listPayments(e.id, 1).length > 0,
      })),
    });
  })
);

router.get(
  "/companies/:id",
  ah(async (req, res) => {
    const e = store.acharEmpresa(req.params.id);
    if (!e) return res.status(404).json({ error: "Empresa não encontrada", code: "COMPANY_NOT_FOUND" });
    const metricas = await metricasDaEmpresa(req, req.params.id, "abrir_empresa");
    const usuarios = await comAcessoAEmpresa(req, req.params.id, "listar_usuarios", async () =>
      (await repo.listUsers()).map(repo.publicUser)
    );
    res.json({
      company: visaoEmpresa(e),
      metricas,
      usuarios,
      assinatura: billing.getActiveSubscription(e.id),
      pagamentos: billing.listPayments(e.id, 12).map(billing.publicPayment),
      auditoria: store.listarAuditoria({ companyId: e.id, limite: 50 }),
    });
  })
);

router.post(
  "/companies",
  ah(async (req, res) => {
    const { name, plan, contactName, contactEmail, contactPhone, doc } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: "Informe o nome da empresa", code: "NAME_REQUIRED" });
    if (plan && !PLAN_IDS.includes(plan)) return res.status(400).json({ error: "Plano inválido", code: "INVALID_PLAN" });

    const id = repo.uid();
    const agora = new Date().toISOString();
    const alvo = getPlan(plan || "basic");
    dir.createCompany({
      id,
      name: name.trim(),
      plan: alvo.id,
      status: "active",
      // Plano pago criado pelo painel já nasce com um ciclo válido: é contratação
      // administrativa, acertada fora do gateway.
      expiresAt: alvo.paid ? addOneMonth(agora) : null,
      contractedAt: agora,
    });
    store.atualizarEmpresa(id, { contactName, contactEmail, contactPhone, doc });
    auditar(req, "criar_empresa", { companyId: id, alvo: name.trim(), detalhe: { plan: alvo.id } });
    res.status(201).json({ company: visaoEmpresa(store.acharEmpresa(id)) });
  })
);

router.patch(
  "/companies/:id",
  ah(async (req, res) => {
    const e = store.acharEmpresa(req.params.id);
    if (!e) return res.status(404).json({ error: "Empresa não encontrada", code: "COMPANY_NOT_FOUND" });
    const { name, contactName, contactEmail, contactPhone, doc, notes } = req.body || {};
    const atualizada = store.atualizarEmpresa(req.params.id, { name, contactName, contactEmail, contactPhone, doc, notes });
    auditar(req, "editar_empresa", { companyId: e.id, alvo: e.name, detalhe: { campos: Object.keys(req.body || {}) } });
    res.json({ company: visaoEmpresa(atualizada) });
  })
);

// Plano e prazo definidos pela plataforma, sem passar por cobrança. É o caminho
// para contrato fechado por fora e para cortesia.
router.post(
  "/companies/:id/plan",
  ah(async (req, res) => {
    const e = store.acharEmpresa(req.params.id);
    if (!e) return res.status(404).json({ error: "Empresa não encontrada", code: "COMPANY_NOT_FOUND" });
    const { plan, expiresAt } = req.body || {};
    if (!PLAN_IDS.includes(plan)) return res.status(400).json({ error: "Plano inválido", code: "INVALID_PLAN" });
    const alvo = getPlan(plan);
    const atualizada = dir.setCompanyPlan(req.params.id, {
      plan,
      status: "active",
      expiresAt: alvo.paid ? expiresAt || addOneMonth(new Date().toISOString()) : null,
      contractedAt: e.plan === plan ? e.contracted_at : new Date().toISOString(),
    });
    auditar(req, "definir_plano", { companyId: e.id, alvo: e.name, detalhe: { de: e.plan, para: plan } });
    res.json({ company: visaoEmpresa(atualizada) });
  })
);

router.post(
  "/companies/:id/block",
  ah(async (req, res) => {
    const e = store.acharEmpresa(req.params.id);
    if (!e) return res.status(404).json({ error: "Empresa não encontrada", code: "COMPANY_NOT_FOUND" });
    const { blocked, reason } = req.body || {};
    const atualizada = store.definirBloqueio(req.params.id, { bloqueado: !!blocked, motivo: reason });
    auditar(req, blocked ? "bloquear_empresa" : "desbloquear_empresa", {
      companyId: e.id,
      alvo: e.name,
      detalhe: { motivo: reason || null },
    });
    res.json({ company: visaoEmpresa(atualizada) });
  })
);

// ---------- Quadros do cliente ----------

router.get(
  "/companies/:id/boards",
  ah(async (req, res) => {
    const boards = await comAcessoAEmpresa(req, req.params.id, "abrir_quadros", async () => {
      // Passa userId null: o painel vê inclusive os quadros privados, que é o
      // sentido de auditoria. Fica registrado que foram abertos.
      const todos = await repo.getWorkspaceCompleto();
      return todos;
    });
    res.json({ boards });
  })
);

// Suporte ativo: corrigir um cartão a pedido do cliente. Registrado com o antes e o
// depois, para a alteração poder ser explicada e desfeita.
router.patch(
  "/companies/:id/cards/:cardId",
  ah(async (req, res) => {
    const resultado = await comAcessoAEmpresa(
      req,
      req.params.id,
      "alterar_cartao",
      async () => {
        const antes = await repo.getCardById(req.params.cardId);
        if (!antes) return null;
        await repo.updateCard(req.params.cardId, req.body || {});
        return { antes, depois: await repo.getCardById(req.params.cardId) };
      },
      { alvo: req.params.cardId, detalhe: { campos: Object.keys(req.body || {}) } }
    );
    if (!resultado) return res.status(404).json({ error: "Cartão não encontrado", code: "CARD_NOT_FOUND" });
    res.json(resultado);
  })
);

// ---------- Permissões dentro da empresa ----------

router.post(
  "/companies/:id/users/:userId/role",
  ah(async (req, res) => {
    const { role } = req.body || {};
    if (role !== "master" && role !== "member") {
      return res.status(400).json({ error: "Papel inválido", code: "INVALID_ROLE" });
    }
    const atualizado = await comAcessoAEmpresa(
      req,
      req.params.id,
      "alterar_papel",
      async () => {
        const alvo = await repo.getUserById(req.params.userId);
        if (!alvo) return null;
        return repo.publicUser(await repo.setUserRole(req.params.userId, role));
      },
      { alvo: req.params.userId, detalhe: { para: role } }
    );
    if (!atualizado) return res.status(404).json({ error: "Usuário não encontrado", code: "USER_NOT_FOUND" });
    res.json({ user: atualizado });
  })
);

// ---------- Métricas globais ----------

router.get(
  "/metrics",
  ah(async (req, res) => {
    const empresas = store.listarEmpresas();
    const porEmpresa = [];
    let totais = { usuarios: 0, quadros: 0, cartoes: 0, atas: 0, anexos: 0 };

    for (const e of empresas) {
      // Cada empresa aberta é uma leitura de dado de cliente, então cada uma é
      // registrada. Ação própria para a trilha não virar ruído de "abrir_empresa".
      const m = await metricasDaEmpresa(req, e.id, "ler_metricas_globais");
      porEmpresa.push({ id: e.id, name: e.name, plan: e.plan, status: effectiveStatus(e), ...m });
      for (const k of Object.keys(totais)) totais[k] += m[k] || 0;
    }

    const pagamentos = empresas.flatMap((e) => billing.listPayments(e.id, 500));
    const pagos = pagamentos.filter((p) => p.status === "paid");
    res.json({
      empresas: {
        total: empresas.length,
        ativas: empresas.filter((e) => effectiveStatus(e) === "active").length,
        emTeste: empresas.filter((e) => effectiveStatus(e) === "trialing").length,
        vencidas: empresas.filter((e) => effectiveStatus(e) === "expired").length,
        bloqueadas: empresas.filter((e) => !!e.blocked_at).length,
      },
      totais,
      porEmpresa,
      receita: {
        // Em centavos, como todo o resto da cobrança.
        totalPagoCents: pagos.reduce((s, p) => s + p.amount_cents, 0),
        pagamentosPagos: pagos.length,
        pagamentosPendentes: pagamentos.filter((p) => p.status === "pending").length,
        pagamentosFalhos: pagamentos.filter((p) => p.status === "failed").length,
      },
    });
  })
);

// ---------- Trilha de auditoria ----------

router.get(
  "/audit",
  ah(async (req, res) => {
    res.json({
      entradas: store.listarAuditoria({
        companyId: req.query.companyId || undefined,
        adminId: req.query.adminId || undefined,
        limite: Math.min(Number(req.query.limite) || 200, 1000),
      }),
    });
  })
);

// ---------- Administradores da plataforma ----------

router.get("/admins", (req, res) => res.json({ admins: store.listarAdmins().map(store.publicAdmin) }));

router.post(
  "/admins",
  ah(async (req, res) => {
    const { email, name, password } = req.body || {};
    if (!email?.trim() || !name?.trim() || !password || password.length < 10) {
      return res.status(400).json({
        error: "Informe nome, e-mail e uma senha com pelo menos 10 caracteres",
        code: "VALIDATION_MISSING_FIELDS",
      });
    }
    if (store.acharAdminPorEmail(email)) {
      return res.status(409).json({ error: "E-mail já cadastrado", code: "EMAIL_ALREADY_REGISTERED" });
    }
    const novo = store.criarAdmin({ email, name: name.trim(), passwordHash: hashSenha(password) });
    auditar(req, "criar_admin", { alvo: novo.email });
    res.status(201).json({ admin: store.publicAdmin(novo) });
  })
);

router.post(
  "/admins/:id/active",
  ah(async (req, res) => {
    const alvo = store.acharAdmin(req.params.id);
    if (!alvo) return res.status(404).json({ error: "Admin não encontrado", code: "ADMIN_NOT_FOUND" });
    const ativo = !!req.body?.active;
    // Desativar a si mesmo tranca o próprio painel e, se for o último ativo, tranca
    // todo mundo para fora sem caminho de volta pela interface.
    if (alvo.id === req.admin.id && !ativo) {
      return res.status(400).json({ error: "Você não pode desativar a própria conta", code: "CANNOT_DEACTIVATE_SELF" });
    }
    const atualizado = store.definirAdminAtivo(req.params.id, ativo);
    auditar(req, ativo ? "ativar_admin" : "desativar_admin", { alvo: alvo.email });
    res.json({ admin: store.publicAdmin(atualizado) });
  })
);

export { router };
