import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";

import { verifyOrigin, requireAuth, requireWritablePlan } from "./middleware.js";

import { router as authRouter } from "./routes/auth.js";
import { router as usersRouter } from "./routes/users.js";
import { router as boardsRouter } from "./routes/boards.js";
import { router as reportsRouter } from "./routes/reports.js";
import { router as listsRouter } from "./routes/lists.js";
import { router as cardsRouter } from "./routes/cards.js";
import { router as geocodeRouter } from "./routes/geocode.js";
import { router as minutesRouter } from "./routes/minutes.js";
import { router as planRouter } from "./routes/plan.js";
import { router as recurrencesRouter } from "./routes/recurrences.js";
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

app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());

// O webhook de pagamento entra ANTES do verifyOrigin. Gateway não é navegador: manda
// POST sem Origin nem Referer, e a checagem de CSRF recusaria todo aviso de
// pagamento com 403. Quem autentica essa rota é a assinatura do provedor, dentro
// dela — ver o comentário em routes/billingWebhook.js.
app.use("/api/billing/webhook", billingWebhookRouter);

app.use("/api", verifyOrigin);

// Auth e plano ficam fora do bloqueio de escrita: sem isso, uma empresa vencida
// não conseguiria nem entrar nem trocar de plano para voltar a escrever.
// Painel de plataforma. Fora do requireAuth e do requireWritablePlan do app: tem
// autenticação própria, com credencial, cookie e segredo separados — ver
// admin/auth.js. Nenhuma sessão de cliente vale aqui.
app.use("/api/admin", adminRouter);

app.use("/api/auth", authRouter);
app.use("/api/plan", planRouter);
// Pop-up promocional da landing: público de propósito, ninguém logou ainda nesse
// ponto da visita. Só GET, então não precisa de verifyOrigin nem de rate limit.
app.use("/api/popup", popupRouter);
// Cobrança fica fora do bloqueio de escrita pelo mesmo motivo do plano: empresa
// vencida precisa poder pagar para voltar a escrever.
app.use("/api/billing", billingRouter);

app.use("/api/users", requireAuth, requireWritablePlan, usersRouter);
app.use("/api/boards", requireAuth, requireWritablePlan, boardsRouter);
app.use("/api/lists", requireAuth, requireWritablePlan, listsRouter);
app.use("/api/cards", requireAuth, requireWritablePlan, cardsRouter);
app.use("/api/geocode", geocodeRouter);
app.use("/api/minutes", requireAuth, requireWritablePlan, minutesRouter);
app.use("/api/recurrences", requireAuth, requireWritablePlan, recurrencesRouter);
// Relatório é leitura, e requireWritablePlan já libera GET - fica no mesmo grupo por
// coerência, e empresa vencida continua conseguindo exportar os próprios dados.
app.use("/api/reports", requireAuth, requireWritablePlan, reportsRouter);

// Imagem do pop-up é pública de propósito: quem monta é o admin da plataforma, quem
// vê é qualquer visitante da landing, sem sessão nenhuma. Fora de /api, então o
// verifyOrigin lá de cima não se aplica - é só GET de arquivo estático.
app.use("/uploads/popups", express.static(popupUploadsDir()));

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
