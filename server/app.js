import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";

import { router as authRouter } from "./routes/auth.js";
import { router as usersRouter } from "./routes/users.js";
import { router as boardsRouter } from "./routes/boards.js";
import { router as listsRouter } from "./routes/lists.js";
import { router as cardsRouter } from "./routes/cards.js";
import { router as geocodeRouter } from "./routes/geocode.js";
import { router as minutesRouter } from "./routes/minutes.js";

export const app = express();

const frontendUrl = process.env.FRONTEND_URL;
if (frontendUrl) {
  app.use(cors({ origin: frontendUrl, credentials: true }));
}

app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/boards", boardsRouter);
app.use("/api/lists", listsRouter);
app.use("/api/cards", cardsRouter);
app.use("/api/geocode", geocodeRouter);
app.use("/api/minutes", minutesRouter);

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
