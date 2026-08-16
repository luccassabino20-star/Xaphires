import { Router } from "express";
import { ah } from "../asyncHandler.js";
import { rateLimit } from "../rateLimit.js";
import * as dir from "../directory.js";
import * as store from "../admin/store.js";
import * as popupStore from "../admin/popupStore.js";
import * as centrosStore from "../admin/centrosCustoStore.js";
import { excluirCentroCusto as finExcluirCentro, excluirTodosCentrosCusto as finExcluirTodosCentros } from "../modules/financeiro/repo.js";
import { novoDestinoDeImagem, extensaoValida, apagarImagem } from "../admin/popupUploads.js";
import Busboy from "busboy";
import fs from "node:fs";
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
import { PLAN_IDS, getPlan, effectiveStatus, daysLeft, addOneMonth, maxUsersFor, attachmentLimitFor } from "../plans.js";
import { MODULE_IDS, moduleEntitlementsFor } from "../modules.js";

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
    // maxUsers/maxAttachmentBytes já vêm com a exceção da empresa aplicada (ver
    // maxUsersFor/attachmentLimitFor em plans.js); planMaxUsers é o valor cru do
    // plano, só para a tela poder mostrar "o padrão seria X" ao lado da exceção.
    maxUsers: maxUsersFor(e),
    planMaxUsers: plano.maxUsers,
    maxUsersOverride: e.max_users_override ?? null,
    maxAttachmentBytes: attachmentLimitFor(e),
    planMaxAttachmentBytes: plano.maxAttachmentBytes,
    maxAttachmentBytesOverride: e.max_attachment_bytes_override ?? null,
    status: effectiveStatus(e),
    blocked: !!e.blocked_at,
    blockedAt: e.blocked_at,
    blockedReason: e.blocked_reason,
    permanentAccess: !!e.permanent_access_at,
    permanentAccessAt: e.permanent_access_at,
    permanentAccessReason: e.permanent_access_reason,
    expiresAt: e.expires_at,
    contractedAt: e.contracted_at,
    daysLeft: daysLeft(e),
    createdAt: e.created_at,
    contactName: e.contact_name,
    contactEmail: e.contact_email,
    contactPhone: e.contact_phone,
    doc: e.doc,
    notes: e.notes,
    // planId -> centavos, só planos com desconto negociado aparecem como chave.
    discounts: dir.getCompanyPlanDiscounts(e),
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

// Desconto negociado por fora, por plano (ver emitirCobranca em
// billing/lifecycle.js) - o mesmo desconto não acompanha a empresa se ela
// trocar de plano depois. Zerar manda discountCents: 0, não omitir o campo -
// omitir seria "não mexer", zerar é "remover o desconto deste plano". Só
// aceita plano pago com preço de tabela: um plano sob consulta (nenhum hoje)
// não teria o que descontar, e o Free é sempre grátis.
router.post(
  "/companies/:id/discount",
  ah(async (req, res) => {
    const e = store.acharEmpresa(req.params.id);
    if (!e) return res.status(404).json({ error: "Empresa não encontrada", code: "COMPANY_NOT_FOUND" });
    const { plan, discountCents } = req.body || {};
    const alvo = PLAN_IDS.includes(plan) ? getPlan(plan) : null;
    if (!alvo || !alvo.paid || alvo.priceCents === null) {
      return res.status(400).json({ error: "Plano inválido para desconto", code: "INVALID_PLAN" });
    }
    if (!Number.isInteger(discountCents) || discountCents < 0) {
      return res.status(400).json({ error: "Desconto inválido", code: "INVALID_DISCOUNT" });
    }
    const atualizada = dir.setCompanyPlanDiscount(req.params.id, plan, discountCents);
    auditar(req, "definir_desconto", {
      companyId: e.id,
      alvo: e.name,
      detalhe: { plan, de: dir.getCompanyPlanDiscounts(e)[plan] || 0, para: discountCents },
    });
    res.json({ company: visaoEmpresa(atualizada) });
  })
);

// Entitlement de módulos da empresa (o que ela pode usar de cada módulo da
// plataforma). É o autoatendimento invertido: quem controla é a plataforma, não
// a empresa. GET devolve o catálogo com o direito atual resolvido; PUT grava a
// lista explícita. Isto é dado do diretório (não entra no banco da empresa),
// então não passa por comAcessoAEmpresa - mas é auditado como qualquer mudança
// contratual.
router.get(
  "/companies/:id/modules",
  ah(async (req, res) => {
    const e = store.acharEmpresa(req.params.id);
    if (!e) return res.status(404).json({ error: "Empresa não encontrada", code: "COMPANY_NOT_FOUND" });
    res.json({ modules: moduleEntitlementsFor(e) });
  })
);

router.put(
  "/companies/:id/modules",
  ah(async (req, res) => {
    const e = store.acharEmpresa(req.params.id);
    if (!e) return res.status(404).json({ error: "Empresa não encontrada", code: "COMPANY_NOT_FOUND" });
    const { modules } = req.body || {};
    if (!Array.isArray(modules) || !modules.every((m) => MODULE_IDS.includes(m))) {
      return res.status(400).json({ error: "Lista de módulos inválida", code: "INVALID_MODULES" });
    }
    // Normaliza para ids únicos e conhecidos, na ordem canônica do catálogo.
    const alvo = MODULE_IDS.filter((id) => modules.includes(id));
    const atualizada = dir.setCompanyModules(req.params.id, alvo);
    auditar(req, "definir_modulos", { companyId: e.id, alvo: e.name, detalhe: { modules: alvo } });
    res.json({ company: visaoEmpresa(atualizada), modules: moduleEntitlementsFor(atualizada) });
  })
);

// Prorroga (days > 0) ou encurta (days < 0) o teste gratuito. As duas direções
// escolhem a base de forma diferente, de propósito:
// - Prorrogar soma ao maior entre "agora" e o vencimento atual, para teste
//   ainda em andamento somar ao que resta, e teste já vencido recomeçar a
//   contar de hoje em vez de ganhar de volta dias que já passaram.
// - Encurtar sempre parte do vencimento atual, nunca de "agora": não existe
//   "tempo já perdido" para descontar em cima, é o prazo combinado que fica
//   menor. Por isso exige que a empresa já tenha um vencimento cadastrado -
//   sem isso não há o que encurtar.
// Sempre volta o status para "trialing" (mesmo que a empresa já tivesse caído
// para "expired"), porque é isso que faz effectiveStatus tratar o novo prazo
// como teste, não como assinatura paga grátis - a tela do cliente e o
// catálogo de planos dependem dessa distinção, mesmo quando o resultado do
// encurtamento cai no passado (a empresa só passa a ler o effectiveStatus
// como "expired" pela data, não porque o status gravado mudou).
router.post(
  "/companies/:id/extend-trial",
  ah(async (req, res) => {
    const e = store.acharEmpresa(req.params.id);
    if (!e) return res.status(404).json({ error: "Empresa não encontrada", code: "COMPANY_NOT_FOUND" });
    const { days } = req.body || {};
    if (!Number.isInteger(days) || days === 0) {
      return res.status(400).json({ error: "Quantidade de dias inválida", code: "INVALID_DAYS" });
    }
    let base;
    if (days > 0) {
      const agora = new Date();
      base = e.expires_at && new Date(e.expires_at) > agora ? new Date(e.expires_at) : agora;
    } else {
      if (!e.expires_at) {
        return res.status(400).json({ error: "Empresa sem prazo de teste para encurtar", code: "NO_TRIAL_TO_SHORTEN" });
      }
      base = new Date(e.expires_at);
    }
    const novoVencimento = new Date(base.getTime() + days * 86400000).toISOString();
    const atualizada = dir.setCompanyPlan(req.params.id, { status: "trialing", expiresAt: novoVencimento });
    auditar(req, days > 0 ? "prorrogar_teste" : "encurtar_teste", {
      companyId: e.id,
      alvo: e.name,
      detalhe: { dias: days, de: e.expires_at, para: novoVencimento },
    });
    res.json({ company: visaoEmpresa(atualizada) });
  })
);

// Exceções numéricas por empresa (ver o comentário na coluna, em directory.js).
// Campo vazio no corpo (null) limpa a exceção; número fixa um teto específico.
// Sem suporte a "ilimitado por exceção" de propósito - quem precisa disso muda
// de plano, que já oferece.
router.post(
  "/companies/:id/limits",
  ah(async (req, res) => {
    const e = store.acharEmpresa(req.params.id);
    if (!e) return res.status(404).json({ error: "Empresa não encontrada", code: "COMPANY_NOT_FOUND" });
    const { maxUsersOverride, maxAttachmentBytesOverride } = req.body || {};
    for (const [nome, valor] of [
      ["maxUsersOverride", maxUsersOverride],
      ["maxAttachmentBytesOverride", maxAttachmentBytesOverride],
    ]) {
      if (valor !== null && valor !== undefined && (!Number.isInteger(valor) || valor <= 0)) {
        return res.status(400).json({ error: `${nome} inválido`, code: "INVALID_LIMIT" });
      }
    }
    const atualizada = dir.setCompanyLimits(req.params.id, { maxUsersOverride, maxAttachmentBytesOverride });
    auditar(req, "definir_limites", {
      companyId: e.id,
      alvo: e.name,
      detalhe: {
        de: { maxUsers: e.max_users_override, maxAttachmentBytes: e.max_attachment_bytes_override },
        para: { maxUsers: maxUsersOverride ?? null, maxAttachmentBytes: maxAttachmentBytesOverride ?? null },
      },
    });
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

// Acesso permanente: cortesia/prêmio que nunca vence, independente de plano ou
// expires_at (ver effectiveStatus em plans.js). Mesma forma da rota de bloqueio -
// motivo fica registrado na auditoria, sem passar por cobrança nem por
// confirmarPagamento().
router.post(
  "/companies/:id/permanent-access",
  ah(async (req, res) => {
    const e = store.acharEmpresa(req.params.id);
    if (!e) return res.status(404).json({ error: "Empresa não encontrada", code: "COMPANY_NOT_FOUND" });
    const { granted, reason } = req.body || {};
    const atualizada = store.definirAcessoPermanente(req.params.id, { concedido: !!granted, motivo: reason });
    auditar(req, granted ? "conceder_acesso_permanente" : "revogar_acesso_permanente", {
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

// Corrige o e-mail de login de um usuário a pedido do cliente (perdeu acesso ao
// e-mail antigo, digitou errado no cadastro etc.). Mesma dupla escrita que a troca
// de e-mail feita pelo próprio master em routes/users.js: banco da empresa e
// diretório global precisam mudar juntos, senão o login para de achar a empresa
// certa. A checagem de conflito e a busca do usuário moram dentro do mesmo acesso
// à empresa, e não antes dele, porque só lá dentro dá para comparar com o e-mail
// atual do alvo - devolve um marcador em vez de lançar erro porque o handler de
// erro genérico do app não lê err.status/err.code, só devolve 500 para tudo.
router.post(
  "/companies/:id/users/:userId/email",
  ah(async (req, res) => {
    const novoEmail = req.body?.email?.trim().toLowerCase();
    if (!novoEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novoEmail)) {
      return res.status(400).json({ error: "E-mail inválido", code: "EMAIL_INVALID" });
    }
    const resultado = await comAcessoAEmpresa(
      req,
      req.params.id,
      "corrigir_email_usuario",
      async () => {
        const alvo = await repo.getUserById(req.params.userId);
        if (!alvo) return null;
        const emailAntigo = alvo.email.toLowerCase();
        if (novoEmail !== emailAntigo && dir.getCompanyIdForEmail(novoEmail)) {
          return { conflito: true };
        }
        const atualizado = repo.publicUser(await repo.updateUser(req.params.userId, { email: novoEmail }));
        if (novoEmail !== emailAntigo) dir.updateUserDirectoryEmail(alvo.email, novoEmail);
        return atualizado;
      },
      { alvo: req.params.userId, detalhe: { para: novoEmail } }
    );
    if (!resultado) return res.status(404).json({ error: "Usuário não encontrado", code: "USER_NOT_FOUND" });
    if (resultado.conflito) return res.status(409).json({ error: "E-mail já em uso", code: "EMAIL_IN_USE" });
    res.json({ user: resultado });
  })
);

// ---------- Métricas globais ----------

router.get(
  "/metrics",
  ah(async (req, res) => {
    const empresas = store.listarEmpresas();
    const porEmpresa = [];
    let totais = { usuarios: 0, quadros: 0, cartoes: 0, anexos: 0 };

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

// Troca da própria senha. Exige a atual mesmo já estando logado: sessão aberta e
// esquecida numa máquina não pode virar troca de senha, que é o que tranca o dono
// para fora da própria conta.
router.post(
  "/senha",
  ah(async (req, res) => {
    const { senhaAtual, novaSenha } = req.body || {};
    if (!novaSenha || novaSenha.length < 10) {
      return res.status(400).json({ error: "A nova senha deve ter ao menos 10 caracteres", code: "PASSWORD_TOO_SHORT" });
    }
    if (!conferirSenha(senhaAtual || "", req.admin.password_hash)) {
      return res.status(401).json({ error: "Senha atual incorreta", code: "CURRENT_PASSWORD_INCORRECT" });
    }
    store.definirSenhaAdmin(req.admin.id, hashSenha(novaSenha));
    auditar(req, "trocar_senha", { alvo: req.admin.email });
    res.json({ ok: true });
  })
);

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

// ---------- Pop-up promocional da landing ----------
// Conteúdo de marketing da plataforma, não dado de empresa cliente - por isso não
// passa por comAcessoAEmpresa (não há empresa envolvida), só por `auditar`.

router.get("/popups", (req, res) => res.json({ popups: popupStore.listarPopups() }));

router.post(
  "/popups",
  ah(async (req, res) => {
    const { title, message, couponCode, buttonLabel, expiresAt } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: "Informe um título", code: "POPUP_TITLE_REQUIRED" });
    if (!couponCode?.trim()) return res.status(400).json({ error: "Informe o código do cupom", code: "POPUP_COUPON_REQUIRED" });
    const novo = popupStore.criarPopup({ title, message, couponCode, buttonLabel, expiresAt });
    auditar(req, "criar_popup", { alvo: novo.title });
    res.status(201).json({ popup: novo });
  })
);

router.patch(
  "/popups/:id",
  ah(async (req, res) => {
    const atual = popupStore.acharPopup(req.params.id);
    if (!atual) return res.status(404).json({ error: "Campanha não encontrada", code: "POPUP_NOT_FOUND" });
    const { title, message, couponCode, buttonLabel, expiresAt } = req.body || {};
    if (title !== undefined && !title.trim()) return res.status(400).json({ error: "Informe um título", code: "POPUP_TITLE_REQUIRED" });
    if (couponCode !== undefined && !couponCode.trim()) {
      return res.status(400).json({ error: "Informe o código do cupom", code: "POPUP_COUPON_REQUIRED" });
    }
    const atualizado = popupStore.atualizarPopup(req.params.id, { title, message, couponCode, buttonLabel, expiresAt });
    auditar(req, "editar_popup", { alvo: atualizado.title, detalhe: { campos: Object.keys(req.body || {}) } });
    res.json({ popup: atualizado });
  })
);

// Ativar/desativar é o "liga/desliga" do painel. Ativar passa por ativarPopup, que
// desativa qualquer outra campanha na mesma transação - nunca duas ligadas juntas.
router.post(
  "/popups/:id/active",
  ah(async (req, res) => {
    const atual = popupStore.acharPopup(req.params.id);
    if (!atual) return res.status(404).json({ error: "Campanha não encontrada", code: "POPUP_NOT_FOUND" });
    const ativo = !!req.body?.active;
    const atualizado = ativo ? popupStore.ativarPopup(req.params.id) : popupStore.desativarPopup(req.params.id);
    auditar(req, ativo ? "ativar_popup" : "desativar_popup", { alvo: atual.title });
    res.json({ popup: atualizado });
  })
);

router.delete(
  "/popups/:id",
  ah(async (req, res) => {
    const atual = popupStore.acharPopup(req.params.id);
    if (!atual) return res.status(404).json({ error: "Campanha não encontrada", code: "POPUP_NOT_FOUND" });
    popupStore.excluirPopup(req.params.id);
    apagarImagem(atual.imageUrl);
    auditar(req, "excluir_popup", { alvo: atual.title });
    res.json({ ok: true });
  })
);

const LIMITE_IMAGEM = 5 * 1024 * 1024; // 5 MB: é um banner de pop-up, não uma foto em resolução de impressão.

// Upload em streaming, como o anexo de cartão (ver cards.js) - mesmo raciocínio de
// não segurar o arquivo inteiro na memória, embora aqui a escala seja bem menor (um
// admin, uma imagem por vez). A imagem antiga da campanha é apagada só depois que a
// nova terminou de gravar, para uma falha no meio do upload não deixar a campanha
// sem nenhuma imagem.
router.post("/popups/:id/image", (req, res) => {
  const atual = popupStore.acharPopup(req.params.id);
  if (!atual) return res.status(404).json({ error: "Campanha não encontrada", code: "POPUP_NOT_FOUND" });

  let bb;
  try {
    bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: LIMITE_IMAGEM } });
  } catch {
    return res.status(400).json({ error: "Envio inválido", code: "INVALID_UPLOAD" });
  }

  let destino = null;
  let bytes = 0;
  let respondido = false;
  let saida = null;

  function falhar(status, body) {
    if (respondido) return;
    respondido = true;
    if (destino && (!saida || saida.destroyed)) fs.unlink(destino.path, () => {});
    req.unpipe(bb);
    res.status(status).json(body);
  }

  bb.on("file", (_campo, stream, info) => {
    const extensao = extensaoValida(info.mimeType);
    if (!extensao) {
      stream.resume(); // drena o stream sem gravar nada, senão a requisição trava esperando o cliente
      return falhar(400, { error: "Envie um arquivo de imagem (JPEG, PNG, WEBP ou GIF)", code: "POPUP_IMAGE_INVALID_TYPE" });
    }
    destino = novoDestinoDeImagem(info.mimeType);
    saida = fs.createWriteStream(destino.path);
    saida.on("error", () => falhar(500, { error: "Erro ao gravar a imagem", code: "UPLOAD_FAILED" }));
    stream.on("data", (chunk) => (bytes += chunk.length));
    stream.on("limit", () => {
      stream.unpipe(saida);
      saida.end();
      falhar(400, {
        error: `A imagem deve ter até ${Math.round(LIMITE_IMAGEM / 1024 / 1024)} MB`,
        code: "POPUP_IMAGE_TOO_LARGE",
      });
    });
    stream.on("error", () => falhar(400, { error: "Falha ao receber a imagem", code: "UPLOAD_FAILED" }));
    stream.pipe(saida);
  });

  bb.on("error", () => falhar(400, { error: "Falha ao receber a imagem", code: "UPLOAD_FAILED" }));

  bb.on("close", () => {
    if (respondido) return;
    if (!destino || bytes === 0) return falhar(400, { error: "Selecione uma imagem", code: "POPUP_IMAGE_REQUIRED" });
    const registrar = () => {
      if (respondido) return;
      respondido = true;
      const imagemAntiga = atual.imageUrl;
      const atualizado = popupStore.definirImagemPopup(req.params.id, destino.url);
      if (imagemAntiga) apagarImagem(imagemAntiga);
      auditar(req, "alterar_imagem_popup", { alvo: atual.title });
      res.status(201).json({ popup: atualizado });
    };
    if (saida && !saida.writableFinished) {
      saida.once("finish", registrar);
      return;
    }
    registrar();
  });

  req.pipe(bb);
});

router.delete(
  "/popups/:id/image",
  ah(async (req, res) => {
    const atual = popupStore.acharPopup(req.params.id);
    if (!atual) return res.status(404).json({ error: "Campanha não encontrada", code: "POPUP_NOT_FOUND" });
    const atualizado = popupStore.definirImagemPopup(req.params.id, null);
    apagarImagem(atual.imageUrl);
    auditar(req, "remover_imagem_popup", { alvo: atual.title });
    res.json({ popup: atualizado });
  })
);

// ---------- Centros de custo (hierárquicos, multiempresa) ----------
// Vivem no diretório global, geridos aqui no painel. Cross-empresa é exclusividade
// do painel - por isso não passam por comAcessoAEmpresa (que abre o banco de UMA
// empresa); a leitura é do diretório, e cada escrita é auditada com a empresa alvo.

// Converte um RegraError do store em 400 com o código estável; outros erros sobem.
function tratarRegra(res, fn) {
  try {
    return { ok: true, valor: fn() };
  } catch (e) {
    if (e instanceof centrosStore.RegraError) {
      res.status(400).json({ error: e.message, code: e.code });
      return { ok: false };
    }
    throw e;
  }
}

router.get(
  "/centros-custo",
  ah(async (req, res) => {
    const companyId = req.query.companyId || undefined;
    res.json({ centros: centrosStore.listarCentros(companyId) });
  })
);

router.post(
  "/centros-custo",
  ah(async (req, res) => {
    const { companyId, codigo, nome } = req.body || {};
    const r = tratarRegra(res, () => centrosStore.criarCentro({ companyId, codigo, nome }));
    if (!r.ok) return;
    auditar(req, "centro_custo_criar", { companyId, alvo: r.valor.codigo, detalhe: { nome: r.valor.nome } });
    res.status(201).json({ centro: r.valor });
  })
);

router.patch(
  "/centros-custo/:id",
  ah(async (req, res) => {
    const atual = centrosStore.acharCentro(req.params.id);
    if (!atual) return res.status(404).json({ error: "Centro de custo não encontrado", code: "CC_NOT_FOUND" });
    const r = tratarRegra(res, () => centrosStore.editarCentro(req.params.id, { nome: req.body?.nome }));
    if (!r.ok) return;
    auditar(req, "centro_custo_editar", { companyId: atual.company_id, alvo: atual.codigo, detalhe: { nome: r.valor.nome } });
    res.json({ centro: r.valor });
  })
);

router.post(
  "/centros-custo/:id/ativo",
  ah(async (req, res) => {
    const atual = centrosStore.acharCentro(req.params.id);
    if (!atual) return res.status(404).json({ error: "Centro de custo não encontrado", code: "CC_NOT_FOUND" });
    const ativo = req.body?.ativo === true;
    const r = tratarRegra(res, () => centrosStore.definirAtivo(req.params.id, ativo));
    if (!r.ok) return;
    auditar(req, ativo ? "centro_custo_reativar" : "centro_custo_desativar", { companyId: atual.company_id, alvo: atual.codigo });
    res.json({ centro: r.valor });
  })
);

// Excluir TODOS os centros de uma empresa. Coleção sem :id - antes das rotas com
// parâmetro. Passa por comAcessoAEmpresa (contexto da empresa + auditoria) e
// reaproveita a MESMA lógica do módulo, que também anula o centro nos lançamentos.
router.delete(
  "/centros-custo",
  ah(async (req, res) => {
    const companyId = req.query.companyId;
    if (!companyId || !store.acharEmpresa(companyId))
      return res.status(400).json({ error: "Empresa não encontrada", code: "CC_EMPRESA_NOT_FOUND" });
    const r = await comAcessoAEmpresa(req, companyId, "centro_custo_excluir_todos", async () => finExcluirTodosCentros());
    res.json(r);
  })
);

router.delete(
  "/centros-custo/:id",
  ah(async (req, res) => {
    const atual = centrosStore.acharCentro(req.params.id);
    if (!atual) return res.status(404).json({ error: "Centro de custo não encontrado", code: "CC_NOT_FOUND" });
    const r = await comAcessoAEmpresa(req, atual.company_id, "centro_custo_excluir", async () => finExcluirCentro(req.params.id));
    res.json(r ?? { removidos: 0 });
  })
);

export { router };
