// Autenticação do painel de plataforma.
//
// SEPARADA DA AUTENTICAÇÃO DO APP, em todas as camadas, e isso é o ponto central
// deste arquivo:
//
//   Tabela separada    `platform_admins`, e não uma coluna em `users`. Um usuário
//                      de empresa não tem como virar admin de plataforma, porque
//                      são cadastros diferentes.
//   Segredo separado   Um token do app NUNCA pode ser aceito aqui, nem por
//                      confusão de formato nem por bug futuro de verificação. Com
//                      segredos distintos, a assinatura simplesmente não bate.
//   Cookie separado    Nome próprio, então estar logado no app não influencia o
//                      painel e vice-versa. Sair de um não derruba o outro.
//   Sessão mais curta  4 horas contra 7 dias do app. Sessão de super admin
//                      esquecida aberta é risco desproporcional ao conforto.
//
// O resultado é que roubar a senha de um cliente, por mais graduado que ele seja
// dentro da empresa dele, não chega nem perto do painel.

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { acharAdmin } from "./store.js";

const DURACAO = "4h";
export const COOKIE_ADMIN = "cantiere_admin";

function carregarSegredo() {
  if (process.env.ADMIN_JWT_SECRET) return process.env.ADMIN_JWT_SECRET;
  const dataDir = process.env.KANBAN_DATA_DIR || path.join(process.cwd(), "server", "data");
  const caminho = path.join(dataDir, "admin-jwt-secret.txt");
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  if (fs.existsSync(caminho)) return fs.readFileSync(caminho, "utf-8").trim();
  const segredo = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(caminho, segredo, "utf-8");
  return segredo;
}

// Arquivo próprio, não o jwt-secret.txt do app. Se os dois compartilhassem segredo,
// um token de app com o payload certo passaria a valer aqui.
const SEGREDO = carregarSegredo();

export function hashSenha(senha) {
  return bcrypt.hashSync(senha, 10);
}
export function conferirSenha(senha, hash) {
  return bcrypt.compareSync(senha, hash);
}

export function assinarTokenAdmin(admin) {
  // `escopo` é redundante com o segredo separado, e existe como segunda barreira:
  // se um dia alguém unificar os segredos por engano, ainda é preciso que o token
  // diga explicitamente que é de painel.
  return jwt.sign({ sub: admin.id, escopo: "platform-admin" }, SEGREDO, { expiresIn: DURACAO });
}

function verificarTokenAdmin(token) {
  try {
    const payload = jwt.verify(token, SEGREDO);
    return payload?.escopo === "platform-admin" ? payload : null;
  } catch {
    return null;
  }
}

export function cookieOpts() {
  const crossSite = Boolean(process.env.FRONTEND_URL);
  return {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite || process.env.NODE_ENV === "production",
    maxAge: 4 * 60 * 60 * 1000,
    path: "/",
  };
}

// Porta de entrada do painel. Lê SÓ o cookie de admin: o cookie do app é ignorado
// aqui de propósito, para não existir caminho em que uma sessão de cliente vire
// sessão de painel.
export function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_ADMIN];
  const payload = token && verificarTokenAdmin(token);
  if (!payload?.sub) {
    return res.status(401).json({ error: "Não autenticado", code: "ADMIN_NOT_AUTHENTICATED" });
  }
  const admin = acharAdmin(payload.sub);
  // Conferido a cada requisição, e não só no login: desativar um admin precisa ter
  // efeito imediato, sem esperar as 4 horas do token expirarem.
  if (!admin || !admin.active) {
    return res.status(401).json({ error: "Não autenticado", code: "ADMIN_NOT_AUTHENTICATED" });
  }
  req.admin = admin;
  next();
}
