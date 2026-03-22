import Fastify from "fastify";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerStatsRoutes } from "./routes/stats.js";

export async function startApiServer(): Promise<void> {
  const app = Fastify({ logger: false });

  registerHealthRoutes(app);
  registerStatsRoutes(app);
  registerWebhookRoutes(app);

  await app.listen({ port: config.api.port, host: config.api.host });
  logger.info(`API server listening on ${config.api.host}:${config.api.port}`);
}
