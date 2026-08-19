import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";

import { verifyOrigin, requireAuth, requireWritablePlan } from "./middleware.js";

import { router as authRouter } from "./routes/auth.js";
import { router as usersRouter } from "./routes/users.js";
import { router as profileRouter } from "./routes/profile.js";
import { router as boardsRouter } from "./routes/boards.js";
import { router as reportsRouter } from "./routes/reports.js";
import { router as listsRouter } from "./routes/lists.js";
import { router as cardsRouter } from "./routes/cards.js";
import { router as geocodeRouter } from "./routes/geocode.js";
import { router as cepRouter } from "./routes/cep.js";
import { router as cnpjRouter } from "./routes/cnpj.js";
import { router as chatRouter } from "./routes/chat.js";
import { router as planRouter } from "./routes/plan.js";
import { router as modulesRouter } from "./routes/modules.js";
import { router as financeiroRouter } from "./modules/financeiro/routes.js";
import { router as saudeClinicasRouter } from "./modules/saude-clinicas/routes.js";
import { router as crmRouter } from "./modules/crm/routes.js";
import { router as anamnesePublicaRouter } from "./routes/anamnesePublica.js";
import { router as recurrencesRouter } from "./routes/recurrences.js";
import { router as personalTasksRouter } from "./routes/personalTasks.js";
import { router as billingRouter } from "./routes/billing.js";
import { router as billingWebhookRouter } from "./routes/billingWebhook.js";
import { router as adminRouter } from "./routes/admin.js";
import { router as popupRouter } from "./routes/popup.js";
import { popupUploadsDir } from "./admin/popupUploads.js";

export const app = express();

// Atrás de um proxy (Nginx, Render, Railway…) req.ip só reflete o cliente real com isto
// ligado. Sem ele o limitador de tentativas contaria todo mundo no mesmo balde.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
}

const frontendUrl = process.env.FRONTEND_URL;
if (frontendUrl) {
  app.use(cors({ origin: frontendUrl, credentials: true }));
}

// CSP fechada na mão, não o default do helmet: esta app carrega recurso externo
// de só três lugares (fonte do Google Fonts, tile do OpenStreetMap no Mapa, e o
// preview de imagem do pop-up promocional via blob: no painel) - liberar tudo com
// useDefaults teria sido mais frouxo que o necessário. object-src/base-uri/
// frame-ancestors travados: não há plugin, não há troca de <base>, e a app não
// existe para ser embutida em iframe de terceiro.
// crossOriginEmbedderPolicy fica desligado de propósito: o padrão do helmet
// (require-corp) bloqueia a folha do Google Fonts e os tiles do OpenStreetMap,
// que não respondem com Cross-Origin-Resource-Policy - nenhum dos dois é
// recurso nosso para adicionar esse cabeçalho.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());

// O webhook de pagamento entra ANTES do verifyOrigin. Gateway não é navegador: manda
// POST sem Origin nem Referer, e a checagem de CSRF recusaria todo aviso de
// pagamento com 403. Quem autentica essa rota é a assinatura do provedor, dentro
// dela — ver o comentário em routes/billingWebhook.js.
app.use("/api/billing/webhook", billingWebhookRouter);

// Formulário público de pré-anamnese (o paciente, sem sessão, abrindo um link
// de WhatsApp): mesmo motivo do webhook acima - o navegador dentro do app do
// WhatsApp pode não mandar Origin/Referer, e não há cookie de sessão para o
// verifyOrigin proteger aqui. Ver o comentário no topo do arquivo da rota.
app.use("/api/public/anamnese", anamnesePublicaRouter);

app.use("/api", verifyOrigin);

// Auth e plano ficam fora do bloqueio de escrita: sem isso, uma empresa vencida
// não conseguiria nem entrar nem trocar de plano para voltar a escrever.
// Painel de plataforma. Fora do requireAuth e do requireWritablePlan do app: tem
// autenticação própria, com credencial, cookie e segredo separados — ver
// admin/auth.js. Nenhuma sessão de cliente vale aqui.
app.use("/api/admin", adminRouter);

app.use("/api/auth", authRouter);
app.use("/api/plan", planRouter);
// Catálogo de módulos da plataforma. Fora do requireWritablePlan, como /api/plan:
// empresa vencida precisa ver os módulos para navegar e voltar a pagar.
app.use("/api/modules", modulesRouter);
// Pop-up promocional da landing: público de propósito, ninguém logou ainda nesse
// ponto da visita. Só GET, então não precisa de verifyOrigin nem de rate limit.
app.use("/api/popup", popupRouter);
// Cobrança fica fora do bloqueio de escrita pelo mesmo motivo do plano: empresa
// vencida precisa poder pagar para voltar a escrever.
app.use("/api/billing", billingRouter);

app.use("/api/users", requireAuth, requireWritablePlan, usersRouter);
app.use("/api/profile", requireAuth, requireWritablePlan, profileRouter);
app.use("/api/boards", requireAuth, requireWritablePlan, boardsRouter);
app.use("/api/lists", requireAuth, requireWritablePlan, listsRouter);
app.use("/api/cards", requireAuth, requireWritablePlan, cardsRouter);
app.use("/api/geocode", geocodeRouter);
app.use("/api/cep", cepRouter);
app.use("/api/cnpj", cnpjRouter);
app.use("/api/chat", requireAuth, requireWritablePlan, chatRouter);
app.use("/api/recurrences", requireAuth, requireWritablePlan, recurrencesRouter);
app.use("/api/personal-tasks", requireAuth, requireWritablePlan, personalTasksRouter);
// Módulo Financeiro. O router já aplica requireAuth/requireWritablePlan/
// requireModule("financeiro") internamente, então monta direto - o requireModule
// é que barra empresa sem o módulo ou usuário sem autorização.
app.use("/api/financeiro", financeiroRouter);
// Módulo Saúde & Clínicas. Mesmo desenho do Financeiro: o router já aplica
// requireAuth/requireWritablePlan/requireModule("saude-clinicas") internamente.
app.use("/api/saude-clinicas", saudeClinicasRouter);
// Módulo CRM, mesmo desenho: o router já aplica requireAuth/
// requireWritablePlan/requireModule("vendas-crm") internamente.
app.use("/api/crm", crmRouter);
// Relatório é leitura, e requireWritablePlan já libera GET - fica no mesmo grupo por
// coerência, e empresa vencida continua conseguindo exportar os próprios dados.
app.use("/api/reports", requireAuth, requireWritablePlan, reportsRouter);

// Imagem do pop-up é pública de propósito: quem monta é o admin da plataforma, quem
// vê é qualquer visitante da landing, sem sessão nenhuma. Fora de /api, então o
// verifyOrigin lá de cima não se aplica - é só GET de arquivo estático.
app.use("/uploads/popups", express.static(popupUploadsDir()));

// og:image precisa ser embutível por qualquer origem (Facebook, WhatsApp, ferramentas
// de preview) - o Cross-Origin-Resource-Policy: same-origin que o helmet manda por
// padrão bloqueia isso NO NAVEGADOR (a URL responde 200 igual, mas o <img> de outro
// site carrega quebrado); rastreador de servidor (o que o WhatsApp/Facebook realmente
// usa para montar a prévia) não é afetado, mas qualquer ferramenta client-side de
// depuração era. Só esse arquivo abre a política; o resto do site continua same-origin.
app.get("/og-image.png", (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

const distPath = path.join(process.cwd(), "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // /uploads também fica de fora do catch-all: sem a exclusão, uma imagem de pop-up
  // apagada ou nunca enviada caía aqui e voltava 200 com o HTML da SPA em vez de 404
  // - foi assim que se descobriu, testando a troca de imagem.
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor", code: "INTERNAL_ERROR" });
});
