import fs from "node:fs";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifySensible from "@fastify/sensible";
import fastifyStatic from "@fastify/static";
import authRoutes from "./routes/auth.js";
import workspaceRoutes from "./routes/workspaces.js";
import projectRoutes from "./routes/projects.js";
import requestRoutes from "./routes/requests.js";
import adminRoutes from "./routes/admin.js";
import mongodbPlugin from "./plugins/mongodb.js";
import jwtPlugin from "./plugins/jwt.js";
import unlockPlugin from "./plugins/unlock.js";
import realtimePlugin from "./plugins/realtime.js";
import { loadConfig, type AppConfig } from "./config.js";

function isAllowedOrigin(origin: string, config: AppConfig): boolean {
  if (config.frontendOrigins.includes(origin)) {
    return true;
  }

  if (config.nodeEnv !== "production") {
    try {
      const url = new URL(origin);
      return url.hostname === "localhost" || url.hostname === "127.0.0.1";
    } catch {
      return false;
    }
  }

  return false;
}

export async function buildApp(config: AppConfig = loadConfig()) {
  const app = Fastify({ logger: true, trustProxy: true });
  app.decorate("config", config);

  await app.register(fastifySensible);
  await app.register(fastifyCors, {
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin, config)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed`), false);
    },
    credentials: true,
  });
  await app.register(mongodbPlugin);
  await app.register(jwtPlugin);
  await app.register(unlockPlugin);
  await app.register(realtimePlugin);

  await app.register(authRoutes, { prefix: "/api" });
  await app.register(workspaceRoutes, { prefix: "/api" });
  await app.register(projectRoutes, { prefix: "/api" });
  await app.register(requestRoutes, { prefix: "/api" });
  await app.register(adminRoutes, { prefix: "/api" });

  app.get("/api/health", async () => ({ ok: true }));

  if (
    config.nodeEnv === "production" &&
    fs.existsSync(config.frontendDistDir)
  ) {
    await app.register(fastifyStatic, {
      root: config.frontendDistDir,
      prefix: "/",
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api")) {
        return reply.status(404).send({ message: "Not Found" });
      }

      return reply.sendFile("index.html");
    });
  }

  return app;
}
