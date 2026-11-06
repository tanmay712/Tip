import Fastify from "fastify";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerStatsRoutes } from "./routes/stats.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";

export async function startApiServer(): Promise<void> {
  const app = Fastify({ logger: false });

  registerDashboardRoutes(app);
  registerHealthRoutes(app);
  registerStatsRoutes(app);

  await app.listen({ port: config.api.port, host: config.api.host });
  logger.info(`API server listening on ${config.api.host}:${config.api.port}`);
}
