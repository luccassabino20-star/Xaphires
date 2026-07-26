import { verifyToken, COOKIE_NAME } from "./auth.js";
import { getUserById, getBoardAccessInfo } from "./repo.js";
import { ah } from "./asyncHandler.js";
import { runWithCompany } from "./context.js";
import { getCompany } from "./directory.js";
import { isWritable } from "./plans.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const DEV = process.env.NODE_ENV !== "production";
const FRONTEND_ORIGIN = process.env.FRONTEND_URL ? parseUrl(process.env.FRONTEND_URL)?.origin : null;
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => parseUrl(value.trim())?.origin)
  .filter(Boolean);

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isAllowedOrigin(req, url) {
  // Compara host em vez da origem completa: atrás de um proxy req.protocol não reflete
  // o esquema real visto pelo navegador e a comparação por origem falharia.
  if (url.host === req.get("host")) return true;
  if (FRONTEND_ORIGIN && url.origin === FRONTEND_ORIGIN) return true;
  if (EXTRA_ORIGINS.includes(url.origin)) return true;
  // Em desenvolvimento o Vite serve o front em outra porta e faz proxy para a API com
  // changeOrigin, que reescreve o Host, então Origin e Host nunca batem.
  if (DEV && isLoopback(url.hostname)) return true;
  return false;
}

// Defesa contra CSRF sem token: o navegador sempre envia Origin em requisições que alteram
// estado e um site externo não consegue forjá-lo. Necessário porque com FRONTEND_URL definida
// o cookie usa sameSite=none, ou seja, viaja em requisições cross-site.
export function verifyOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const url = parseUrl(req.get("origin") || req.get("referer") || "");
  if (!url) {
    return res.status(403).json({ error: "Origem da requisição ausente", code: "CSRF_ORIGIN_MISSING" });
  }
  if (!isAllowedOrigin(req, url)) {
    return res.status(403).json({ error: "Origem da requisição não permitida", code: "CSRF_ORIGIN_MISMATCH" });
  }
  next();
}

export const requireAuth = ah(async (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  const payload = token && verifyToken(token);
  if (!payload?.companyId) return res.status(401).json({ error: "Não autenticado", code: "NOT_AUTHENTICATED" });
  return runWithCompany(payload.companyId, async () => {
    const user = await getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Não autenticado", code: "NOT_AUTHENTICATED" });
    req.companyId = payload.companyId;
    req.user = user;
    next();
  });
});

// Bloqueio de escrita quando o plano venceu. Aplicado uma vez por método, e não
// rota a rota: qualquer rota nova nasce protegida, sem depender de alguém lembrar.
// GET continua liberado — vencido é somente leitura, a pessoa nunca perde acesso
// aos próprios dados.
export function requireWritablePlan(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const company = getCompany(req.companyId);
  if (isWritable(company)) return next();
  return res.status(403).json({
    error: "Seu plano expirou. Renove para voltar a editar.",
    code: "PLAN_EXPIRED",
  });
}

export function requireMaster(req, res, next) {
  if (req.user?.role !== "master") return res.status(403).json({ error: "Acesso restrito ao usuário master", code: "FORBIDDEN_MASTER_ONLY" });
  next();
}

export function hasBoardAccess(user, access) {
  if (!access) return false;
  if (access.visibility !== "private") return true;
  return access.ownerId === user.id;
}

// getBoardId(req) resolves the board id to check from the request (directly or via a list/card lookup).
// Use as a route-specific middleware argument: router.patch("/:id", requireBoardAccess(req => req.params.id), handler)
export function requireBoardAccess(getBoardId) {
  return ah(async (req, res, next) => {
    const boardId = getBoardId(req);
    if (!boardId) return res.status(404).json({ error: "Quadro não encontrado", code: "BOARD_NOT_FOUND" });
    const access = await getBoardAccessInfo(boardId);
    if (!access) return res.status(404).json({ error: "Quadro não encontrado", code: "BOARD_NOT_FOUND" });
    if (!hasBoardAccess(req.user, access))
      return res.status(403).json({ error: "Você não tem acesso a este quadro", code: "FORBIDDEN_BOARD_ACCESS" });
    next();
  });
}

// resolveBoardId(paramValue) resolves the board id from a route param (e.g. a list or card id).
// Use with router.param("id", requireBoardAccessParam(repo.getBoardIdForList)) so it applies to every route in the router.
export function requireBoardAccessParam(resolveBoardId) {
  return ah(async (req, res, next, value) => {
    const boardId = await resolveBoardId(value);
    if (!boardId) return res.status(404).json({ error: "Não encontrado", code: "NOT_FOUND" });
    const access = await getBoardAccessInfo(boardId);
    if (!access) return res.status(404).json({ error: "Quadro não encontrado", code: "BOARD_NOT_FOUND" });
    if (!hasBoardAccess(req.user, access))
      return res.status(403).json({ error: "Você não tem acesso a este quadro", code: "FORBIDDEN_BOARD_ACCESS" });
    next();
  });
}
