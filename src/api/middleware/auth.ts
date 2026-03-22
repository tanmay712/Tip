import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAlchemySignature } from "../../blockchain/webhooks.js";

export async function verifyAlchemyWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const signature = request.headers["x-alchemy-signature"] as string;
  if (!signature) {
    reply.status(401).send({ error: "Missing signature" });
    return;
  }

  const rawBody =
    typeof request.body === "string"
      ? request.body
      : JSON.stringify(request.body);

  if (!verifyAlchemySignature(rawBody, signature)) {
    reply.status(401).send({ error: "Invalid signature" });
    return;
  }
}
