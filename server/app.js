import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";

import { verifyOrigin, requireAuth, requireWritablePlan } from "./middleware.js";

import { router as authRouter } from "./routes/auth.js";
import { router as usersRouter } from "./routes/users.js";
import { router as boardsRouter } from "./routes/boards.js";
import { router as listsRouter } from "./routes/lists.js";
import { router as cardsRouter } from "./routes/cards.js";
import { router as geocodeRouter } from "./routes/geocode.js";
import { router as minutesRouter } from "./routes/minutes.js";
import { router as planRouter } from "./routes/plan.js";
import { router as recurrencesRouter } from "./routes/recurrences.js";

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
app.use("/api", verifyOrigin);

// Auth e plano ficam fora do bloqueio de escrita: sem isso, uma empresa vencida
// não conseguiria nem entrar nem trocar de plano para voltar a escrever.
app.use("/api/auth", authRouter);
app.use("/api/plan", planRouter);

app.use("/api/users", requireAuth, requireWritablePlan, usersRouter);
app.use("/api/boards", requireAuth, requireWritablePlan, boardsRouter);
app.use("/api/lists", requireAuth, requireWritablePlan, listsRouter);
app.use("/api/cards", requireAuth, requireWritablePlan, cardsRouter);
app.use("/api/geocode", geocodeRouter);
app.use("/api/minutes", requireAuth, requireWritablePlan, minutesRouter);
app.use("/api/recurrences", requireAuth, requireWritablePlan, recurrencesRouter);

const distPath = path.join(process.cwd(), "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor", code: "INTERNAL_ERROR" });
});
