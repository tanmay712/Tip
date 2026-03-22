import type { FastifyInstance } from "fastify";
import { verifyAlchemySignature, type AlchemyWebhookEvent } from "../../blockchain/webhooks.js";
import { processWebhookDeposit } from "../../core/deposit.service.js";
import { logger } from "../../utils/logger.js";

export function registerWebhookRoutes(app: FastifyInstance): void {
  app.post("/webhooks/alchemy", {
    config: { rawBody: true },
    handler: async (request, reply) => {
      const signature = request.headers["x-alchemy-signature"] as string;
      const rawBody =
        typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body);

      if (signature && !verifyAlchemySignature(rawBody, signature)) {
        logger.warn("Invalid Alchemy webhook signature");
        return reply.status(401).send({ error: "Invalid signature" });
      }

      try {
        const event = (
          typeof request.body === "string"
            ? JSON.parse(request.body)
            : request.body
        ) as AlchemyWebhookEvent;

        const result = await processWebhookDeposit(event);
        logger.info({ credited: result.credited }, "Webhook processed");
        return reply.send({ ok: true, credited: result.credited });
      } catch (err) {
        logger.error({ err }, "Webhook processing failed");
        return reply.status(500).send({ error: "Processing failed" });
      }
    },
  });
}
