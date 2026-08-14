import { verifyToken, COOKIE_NAME } from "./auth.js";
import { getUserById, getBoardAccessInfo } from "./repo.js";
import { ah } from "./asyncHandler.js";
import { runWithCompany } from "./context.js";
import { getCompany } from "./directory.js";
import { isWritable } from "./plans.js";
import { isModuleEnabled } from "./modules.js";

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
  // A empresa ainda existe? O token vale 7 dias e sobrevive à exclusão dela. Sem
  // esta conferência, getCompanyDb() adiante faz mkdirSync e RECRIA um banco vazio
  // a cada requisição da sessão órfã — ninguém entra, porque o usuário não existe
  // no banco novo, mas a pasta ressuscita sozinha depois de apagada.
  if (!getCompany(payload.companyId)) {
    return res.status(401).json({ error: "Não autenticado", code: "NOT_AUTHENTICATED" });
  }
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

// Barra quem não pode acessar um módulo da plataforma: confere o entitlement da
// empresa E a autorização do usuário, na autoridade única (modules.js). Aplicado
// por router, uma vez - rota nova do módulo nasce protegida, como requireWritablePlan.
// A recusa é genérica de propósito (não diz se faltou plano ou permissão), para
// não revelar a estrutura de acesso a quem sonda.
export function requireModule(moduleId) {
  return (req, res, next) => {
    const company = getCompany(req.companyId);
    if (isModuleEnabled(company, req.user, moduleId)) return next();
    return res.status(403).json({ error: "Módulo indisponível", code: "MODULE_FORBIDDEN" });
  };
}

// Papel de um usuário num quadro, ou null quando ele não tem acesso nenhum.
// Quadro compartilhado devolve "editor": é o comportamento que sempre valeu, todo
// mundo da empresa entra e escreve, e não existe convite ali.
//
// O dono é reconhecido por boards.owner_id, e não pela linha 'owner' da tabela de
// permissões: a tabela é derivada, e uma autorização que dependesse dela abriria a
// porta a qualquer escrita que conseguisse inserir uma linha lá.
//
// Repare que master não passa por aqui. Privado é privado inclusive para o master
// da empresa — sempre foi assim, e afrouxar isso agora esvaziaria o recurso.
export function boardRoleFor(user, access) {
  if (!access || !user) return null;
  if (access.visibility !== "private") return "editor";
  if (access.ownerId === user.id) return "owner";
  return access.roles?.get(user.id) || null;
}

export function hasBoardAccess(user, access) {
  return boardRoleFor(user, access) !== null;
}

// Guarda comum aos dois middlewares. Devolve o papel quando libera, ou responde e
// devolve null quando recusa.
function autorizarQuadro(req, res, access) {
  if (!access) {
    res.status(404).json({ error: "Quadro não encontrado", code: "BOARD_NOT_FOUND" });
    return null;
  }
  const role = boardRoleFor(req.user, access);
  // 403, e não 404: o quadro existe e o pedido é legítimo, só não é dele. Esconder
  // a existência aqui não protegeria nada, porque o id só chega a quem já o viu.
  if (!role) {
    res.status(403).json({ error: "Você não tem acesso a este quadro", code: "FORBIDDEN_BOARD_ACCESS" });
    return null;
  }
  // Convidado como leitor não escreve. A checagem fica aqui, no mesmo lugar em que
  // o acesso é conferido, e não rota a rota: cartão, lista, recorrência e anexo
  // passam todos por um destes dois middlewares, então rota nova nasce protegida.
  if (role === "viewer" && !SAFE_METHODS.has(req.method)) {
    res.status(403).json({ error: "Seu acesso a este quadro é somente leitura", code: "FORBIDDEN_BOARD_READ_ONLY" });
    return null;
  }
  req.boardAccess = access;
  req.boardRole = role;
  return role;
}

// getBoardId(req) resolves the board id to check from the request (directly or via a list/card lookup).
// Use as a route-specific middleware argument: router.patch("/:id", requireBoardAccess(req => req.params.id), handler)
export function requireBoardAccess(getBoardId) {
  return ah(async (req, res, next) => {
    const boardId = getBoardId(req);
    if (!boardId) return res.status(404).json({ error: "Quadro não encontrado", code: "BOARD_NOT_FOUND" });
    if (!autorizarQuadro(req, res, await getBoardAccessInfo(boardId))) return;
    next();
  });
}

// resolveBoardId(paramValue) resolves the board id from a route param (e.g. a list or card id).
// Use with router.param("id", requireBoardAccessParam(repo.getBoardIdForList)) so it applies to every route in the router.
export function requireBoardAccessParam(resolveBoardId) {
  return ah(async (req, res, next, value) => {
    const boardId = await resolveBoardId(value);
    if (!boardId) return res.status(404).json({ error: "Não encontrado", code: "NOT_FOUND" });
    if (!autorizarQuadro(req, res, await getBoardAccessInfo(boardId))) return;
    next();
  });
}

// Administrar o quadro privado (compartilhar, excluir) é só do dono. Depende de
// requireBoardAccess ter rodado antes, que é quem carrega req.boardRole.
export function requireBoardOwner(req, res, next) {
  if (req.boardRole !== "owner") {
    return res.status(403).json({ error: "Apenas o dono do quadro pode fazer isso", code: "FORBIDDEN_BOARD_OWNER_ONLY" });
  }
  next();
}
