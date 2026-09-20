/// <reference path="./types/express.d.ts" />
import "dotenv/config";

import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";

// ESM route imports MUST include .js
import authRoute from "./routes/auth.js";
import uploadsRouter from "./routes/uploads.js";
import numbersRouter from "./routes/numbers.js";
import workflowsRouter from "./routes/workflows.js";
import copilotRouter from "./routes/copilot.js";
import tagsRouter from "./routes/tags.js";
import messagesRouter from "./routes/messages.js";
import twilioRouter from "./routes/twilio.js";
import leadsRouter from "./routes/leads.js";
import leadTagsRouter from "./routes/lead-tags.js";
import templatesRouter from "./routes/templates.js";

import { requireAuth } from "./middleware/auth.js";
import { rateLimit } from "express-rate-limit";

const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;

/** Normalize to "scheme://host[:port]" */
function norm(u?: string | null) {
  if (!u) return "";

  try {
    return new URL(u).origin;
  } catch {
    return String(u).replace(/\/+$/, "");
  }
}

/** Explicit allow-list from env (comma separated) */
const envList = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => norm(s.trim()))
  .filter(Boolean);

/** In development, also allow http://localhost:<any port>. */
const isDev = process.env.NODE_ENV !== "production";
const localhost = /^http:\/\/localhost(:\d+)?$/;

/** Single CORS middleware that always answers OPTIONS */
function corsGuard(req: Request, res: Response, next: NextFunction) {
  const origin = norm(req.headers.origin as string | undefined);

  const allowed =
    !origin ||
    envList.includes(origin) ||
    (isDev && localhost.test(origin));

  if (allowed) {
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Origin", origin || "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    return next();
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(403);
  }

  return res.status(403).json({
    error: "Not allowed by CORS",
  });
}

const app = express();

// Behind exactly one proxy (Render). "true" would let anyone fake their IP
// with an X-Forwarded-For header and dodge the login rate limit.
app.set("trust proxy", 1);

// Slow down password guessing: 20 attempts per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Wait a few minutes and try again." },
});

// global JSON for most routes
app.use(express.json({ limit: "2mb" }));
app.use(corsGuard);

/* ----------------------------- Public ----------------------------- */

/** Health */
app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    ts: Date.now(),
  });
});

/** Login/register/me */
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", authRoute);

/**
 * Twilio webhooks MUST remain public.
 *
 * Twilio does not have the user's JWT, so these routes use
 * Twilio request validation instead of requireAuth.
 */
app.use(
  "/api/twilio",
  express.urlencoded({ extended: false }),
  twilioRouter
);

/* --------------------------- Protected API --------------------------- */

app.use("/api/uploads", requireAuth, uploadsRouter);

app.use("/api/numbers", requireAuth, numbersRouter);

app.use("/api/workflows", requireAuth, workflowsRouter);

app.use("/api/copilot", requireAuth, copilotRouter);

app.use("/api/tags", requireAuth, tagsRouter);

app.use("/api/templates", requireAuth, templatesRouter);

app.use("/api/messages", requireAuth, messagesRouter);

/**
 * Real leads API.
 *
 * leadsRouter:
 *   GET  /api/leads
 *   POST /api/leads
 *
 * leadTagsRouter:
 *   GET    /api/leads/:leadId/tags
 *   POST   /api/leads/:leadId/tags
 *   DELETE /api/leads/:leadId/tags/:tagId
 */
app.use("/api/leads", requireAuth, leadsRouter);
app.use("/api/leads", requireAuth, leadTagsRouter);

/* ------------------------------ Root ------------------------------ */

app.get("/", (_req, res) => {
  res.type("text").send(`GroScale API is running ✅

Try:
/health
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/uploads/import
GET  /api/leads
GET  /api/workflows
GET  /api/tags
GET  /api/templates
GET  /api/messages/threads
POST /api/messages/start
POST /api/messages/send
POST /api/twilio/inbound
POST /api/copilot/draft`);
});

/* ------------------------------ 404 ------------------------------- */

app.use((_req, res) => {
  res.status(404).json({
    error: "Not found",
  });
});

/* ------------------------- Error handler ------------------------- */

app.use(
  (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    const code =
      typeof err?.status === "number"
        ? err.status
        : 500;

    res.status(code).json({
      error: err?.message || "Server error",
    });
  }
);

/* ------------------------------ Start ------------------------------ */

app.listen(PORT, () => {
  console.log(`🚀 GroScales API running on port ${PORT}`);
});
