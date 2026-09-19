// @ts-check
import express from "express";
import cors from "cors";

import { validateAuthenticatedSession } from "./middleware/auth.middleware.js";
import authRouter from "./router/auth.router.js";
import webhookRouter from "./router/webhook.router.js";
import productRouter from "./router/product.router.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  })
);

app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use(authRouter);
app.use(webhookRouter);

app.use("/api/*", validateAuthenticatedSession);
app.use(productRouter);

export { app };