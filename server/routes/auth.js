import { Router } from "express";
import { hashPassword, verifyPassword, signToken, verifyToken, COOKIE_NAME } from "../auth.js";
import { requireAuth } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import { runWithCompany } from "../context.js";
import { rateLimit } from "../rateLimit.js";
import * as directory from "../directory.js";
import { getSeedContent } from "../seedContent.js";
import { DEFAULT_TRIAL_PLAN, trialEndsAt } from "../plans.js";
import {
  uid,
  getUserByEmail,
  getUserById,
  insertUser,
  publicUser,
  setPassword,
  createBoard,
  createList,
  createCard,
  updateCard,
} from "../repo.js";

const router = Router();

const CROSS_SITE = Boolean(process.env.FRONTEND_URL);
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: CROSS_SITE ? "none" : "lax",
  // sameSite=none exige Secure; em produção o cookie de sessão nunca deve trafegar em HTTP.
  secure: CROSS_SITE || process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

function setAuthCookie(res, user, companyId) {
  res.cookie(COOKIE_NAME, signToken(user, companyId), COOKIE_OPTS);
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Dois limites combinados: por IP trava quem varre vários e-mails da mesma origem,
// por e-mail trava quem distribui as tentativas contra uma conta específica.
const loginLimitByIp = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 20,
  keyFn: (req) => req.ip,
  message: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
  code: "TOO_MANY_LOGIN_ATTEMPTS",
});

const loginLimitByEmail = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 8,
  keyFn: (req) => (req.body?.email || "").trim().toLowerCase(),
  message: "Muitas tentativas de login para esta conta. Aguarde alguns minutos e tente novamente.",
  code: "TOO_MANY_LOGIN_ATTEMPTS",
});

const registerLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyFn: (req) => req.ip,
  message: "Muitos cadastros a partir deste endereço. Tente novamente mais tarde.",
  code: "TOO_MANY_REGISTRATIONS",
});

function validateCredentials(name, email, password) {
  if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
    return "Preencha nome, e-mail e uma senha com pelo menos 6 caracteres";
  }
  return null;
}

router.get(
  "/me",
  ah(async (req, res) => {
    const token = req.cookies?.[COOKIE_NAME];
    const payload = token && verifyToken(token);
    if (!payload?.companyId) return res.status(401).json({ error: "Não autenticado", code: "NOT_AUTHENTICATED" });
    const user = await runWithCompany(payload.companyId, () => getUserById(payload.sub));
    if (!user) return res.status(401).json({ error: "Não autenticado", code: "NOT_AUTHENTICATED" });
    res.json(publicUser(user));
  })
);

router.post(
  "/register-company",
  registerLimit,
  ah(async (req, res) => {
    const { companyName, name, email, password, locale } = req.body || {};
    if (!companyName?.trim()) return res.status(400).json({ error: "Informe o nome da empresa", code: "COMPANY_NAME_REQUIRED" });
    const validationError = validateCredentials(name, email, password);
    if (validationError) return res.status(400).json({ error: validationError, code: "VALIDATION_MISSING_FIELDS" });
    if (directory.getCompanyIdForEmail(email))
      return res.status(409).json({ error: "E-mail já cadastrado", code: "EMAIL_ALREADY_REGISTERED" });

    // Empresa nova entra no teste de 7 dias do plano Profissional, que é o que a
    // landing promete. Vencido o prazo, vira somente leitura até escolher um plano
    // — inclusive o Básico gratuito, que não expira.
    const companyId = uid();
    directory.createCompany({
      id: companyId,
      name: companyName.trim(),
      plan: DEFAULT_TRIAL_PLAN,
      status: "trialing",
      expiresAt: trialEndsAt(),
    });
    const seed = getSeedContent(locale);

    const user = await runWithCompany(companyId, async () => {
      const master = await insertUser({
        name: name.trim(),
        email: email.trim(),
        passwordHash: hashPassword(password),
        role: "master",
      });

      const boardId = await createBoard({ title: seed.boardTitle });
      const listTodo = await createList(boardId, { title: seed.listTodo });
      const listDoing = await createList(boardId, { title: seed.listDoing });
      await createList(boardId, { title: seed.listDone });
      const c1 = await createCard(listTodo, { title: seed.welcomeCardTitle });
      await updateCard(c1, {
        description: seed.welcomeCardDescription,
        labels: ["blue"],
      });
      await createCard(listTodo, { title: seed.dragCardTitle });
      await createCard(listDoing, { title: seed.inviteCardTitle });

      return master;
    });

    // Corrida rara: alguém registrou o mesmo e-mail entre a checagem acima e agora.
    // A empresa/usuário criados ficam órfãos (sem entrada no diretório, portanto inacessíveis)
    // em vez de sobrescrever o registro do vencedor da corrida.
    try {
      directory.addUserToDirectory(email, companyId);
    } catch {
      return res.status(409).json({ error: "E-mail já cadastrado", code: "EMAIL_ALREADY_REGISTERED" });
    }

    setAuthCookie(res, user, companyId);
    res.status(201).json(publicUser(user));
  })
);

router.post(
  "/login",
  loginLimitByIp,
  loginLimitByEmail,
  ah(async (req, res) => {
    const { email, password } = req.body || {};
    const companyId = email && directory.getCompanyIdForEmail(email);
    if (!companyId) return res.status(401).json({ error: "E-mail ou senha inválidos", code: "INVALID_CREDENTIALS" });

    const user = await runWithCompany(companyId, () => getUserByEmail(email));
    if (!user || !verifyPassword(password || "", user.password_hash)) {
      return res.status(401).json({ error: "E-mail ou senha inválidos", code: "INVALID_CREDENTIALS" });
    }
    // Acertou a senha: o dono legítimo da conta não fica preso pelas tentativas anteriores.
    loginLimitByEmail.reset(req);
    setAuthCookie(res, user, companyId);
    res.json(publicUser(user));
  })
);

router.post("/logout", (req, res) => {
  // Os atributos precisam bater com os do cookie original, senão o navegador não o remove.
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: COOKIE_OPTS.sameSite,
    secure: COOKIE_OPTS.secure,
    path: "/",
  });
  res.json({ ok: true });
});

router.post(
  "/change-password",
  requireAuth,
  ah(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "A nova senha deve ter ao menos 6 caracteres", code: "PASSWORD_TOO_SHORT" });
    }
    if (!verifyPassword(currentPassword || "", req.user.password_hash)) {
      return res.status(401).json({ error: "Senha atual incorreta", code: "CURRENT_PASSWORD_INCORRECT" });
    }
    await setPassword(req.user.id, hashPassword(newPassword));
    res.json({ ok: true });
  })
);

export { router };
