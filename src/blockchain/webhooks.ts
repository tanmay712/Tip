import crypto from "node:crypto";
import { config } from "../config.js";

export interface AlchemyWebhookEvent {
  webhookId: string;
  id: string;
  createdAt: string;
  type: string;
  event: {
    network: string;
    activity: Array<{
      fromAddress: string;
      toAddress: string;
      blockNum: string;
      hash: string;
      value: number;
      asset: string;
      category: string;
      rawContract?: {
        rawValue: string;
        address: string;
        decimals: number;
      };
    }>;
  };
}

export function verifyAlchemySignature(
  body: string,
  signature: string,
): boolean {
  if (!config.alchemy.webhookSigningKey) return false;
  const hmac = crypto.createHmac("sha256", config.alchemy.webhookSigningKey);
  hmac.update(body);
  const expected = hmac.digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}
