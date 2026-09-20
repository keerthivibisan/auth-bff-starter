import "./types";
import path from "path";
import fs from "fs";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { config } from "./config";
import { initOidc } from "./oidc";
import { sessionMiddleware } from "./session";
import { authRouter } from "./routes/auth";

// If a built SPA is present alongside the BFF (see README's "single origin
// deployment" section), serve it directly so the app and BFF share one
// origin in production too — no CORS, and the simplest possible cookie story.
const spaDist = path.resolve(__dirname, "../../frontend/dist");
const hasSpaBuild = fs.existsSync(path.join(spaDist, "index.html"));

async function main() {
  await initOidc();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // The SPA and BFF are same-origin in the recommended setup; relax CSP
      // here if you serve them from different origins/CDNs.
      contentSecurityPolicy: false,
    })
  );

  app.use(
    cors({
      origin: config.appBaseUrl,
      credentials: true,
    })
  );

  app.use(express.json());
  app.use(sessionMiddleware);

  app.use("/api/auth", authRouter);

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  if (hasSpaBuild) {
    app.use(express.static(spaDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(spaDist, "index.html"));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  app.listen(config.port, () => {
    console.log(`BFF listening on ${config.bffBaseUrl} (env: ${config.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error("Failed to start BFF:", err);
  process.exit(1);
});
