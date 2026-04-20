import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";

const app = express();
const httpServer = createServer(app);

// Don't advertise the framework. Removes `X-Powered-By: Express`
// so we're not giving attackers a free fingerprint for CVE matching.
app.disable("x-powered-by");

// Trust the first proxy hop so express-rate-limit keys on the real client IP
// instead of the proxy's IP. Only trust one hop — trusting everything would
// let callers spoof X-Forwarded-For to evade the rate limiter.
app.set("trust proxy", 1);

// Security headers: CSP, HSTS, nosniff, frame-deny, referrer-policy, etc.
// `contentSecurityPolicy: false` in development only — Vite's HMR client
// needs inline scripts/eval and would break otherwise. Production gets the
// default helmet CSP which is strict.
const isProd = process.env.NODE_ENV === "production";
app.use(
  helmet({
    contentSecurityPolicy: isProd ? undefined : false,
    crossOriginEmbedderPolicy: false, // allow the demo video and external repo embeds
  }),
);

// CORS policy:
// - Non-browser requests (curl, server-to-server — no Origin header) always allowed.
// - In development: allow all cross-origin requests so devs can hit the API
//   from their terminal, Postman, or a local frontend on a different port.
// - In production: deny cross-origin browser requests by default. This blocks
//   the "cross-site JS on someone else's page spends your LLM budget" attack.
//   If a partner needs to hit the API from the browser, add their origin to
//   the ALLOWED_ORIGINS env var (comma-separated).
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  "/api",
  cors({
    origin: (origin, cb) => {
      // Same-origin and non-browser requests have no Origin header.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      // In dev, be permissive. In prod, deny unless explicitly allowlisted.
      if (!isProd) return cb(null, true);
      return cb(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

// Rate limiting. Two tiers:
//   - /api/route and /api/score: 30 requests per minute per IP (these
//     are the ones that spend real money via LLM calls).
//   - Everything else under /api: 120 requests per minute per IP.
const routeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many routing requests. Try again in a minute." },
});
const readLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many requests. Try again in a minute." },
});
app.use("/api/route", routeLimiter);
app.use("/api/score", routeLimiter);
app.use("/api", readLimiter);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Explicit body-size cap (helmet doesn't do this). 100KB is plenty for a
// routing payload — anything larger is either abuse or a bug.
app.use(
  express.json({
    limit: "100kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "100kb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Never include the response body in logs. LLM outputs can contain
      // sensitive user input, and shipping logs to any aggregator would
      // exfiltrate them. Keep only status + latency.
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
