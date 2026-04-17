/**
 * Security event logger.
 *
 * Every security event is:
 *   1. Written to pino at the appropriate level (warn/info)
 *   2. Optionally posted as an embed to all configured Discord log channels
 *
 * Call logSecurityEvent() from services and command handlers. Pass
 * discordAlert: true for events that warrant real-time visibility in log channels.
 */

import { logger } from "./logger.js";
import { formatTokenAmount } from "./format.js";

export type SecurityEventType =
  // Rate limiting
  | "RATE_LIMITED"
  | "COMMAND_SPAM"
  // Deposits
  | "DUST_DEPOSIT_IGNORED"
  | "DEPOSIT_CREDITED"
  | "LARGE_DEPOSIT"
  // Withdrawals
  | "WITHDRAWAL_COMPLETED"
  | "WITHDRAWAL_FAILED"
  | "LARGE_WITHDRAWAL"
  // Tips
  | "TIP_BURST_DETECTED"
  // Admin actions
  | "USER_BANNED"
  | "USER_UNBANNED"
  // Sensitive operations
  | "PRIVATE_KEY_EXPORT";

export interface SecurityEventData {
  type: SecurityEventType;
  discordId?: string;
  chainId?: string;
  /** Raw integer amount string */
  amount?: string;
  decimals?: number;
  tokenSymbol?: string;
  txHash?: string;
  isTestnet?: boolean;
  extra?: Record<string, string | number | boolean>;
}

const SEVERITY: Record<SecurityEventType, "warn" | "info" | "debug"> = {
  RATE_LIMITED:           "info",
  COMMAND_SPAM:           "warn",
  DUST_DEPOSIT_IGNORED:   "debug",
  DEPOSIT_CREDITED:       "info",
  LARGE_DEPOSIT:          "warn",
  WITHDRAWAL_COMPLETED:   "info",
  WITHDRAWAL_FAILED:      "warn",
  LARGE_WITHDRAWAL:       "warn",
  TIP_BURST_DETECTED:     "warn",
  USER_BANNED:            "warn",
  USER_UNBANNED:          "info",
  PRIVATE_KEY_EXPORT:     "warn",
};

const DISCORD_ALERT: Set<SecurityEventType> = new Set([
  "LARGE_DEPOSIT",
  "LARGE_WITHDRAWAL",
  "TIP_BURST_DETECTED",
  "USER_BANNED",
  "USER_UNBANNED",
  "WITHDRAWAL_COMPLETED",
  "PRIVATE_KEY_EXPORT",
]);

/** Log a security event. Automatically posts to Discord for high-value events. */
export function logSecurityEvent(event: SecurityEventData, forceDiscordAlert = false): void {
  const logData = {
    security: true,
    event: event.type,
    ...event,
    extra: undefined,
    ...event.extra,
  };

  const level = SEVERITY[event.type];
  if (level === "warn") {
    logger.warn(logData, `[SECURITY] ${event.type}`);
  } else if (level === "info") {
    logger.info(logData, `[SECURITY] ${event.type}`);
  } else {
    logger.debug(logData, `[SECURITY] ${event.type}`);
  }

  if (forceDiscordAlert || DISCORD_ALERT.has(event.type)) {
    // Lazy import to avoid circular deps at module load time
    void postDiscordAlert(event);
  }
}

async function postDiscordAlert(event: SecurityEventData): Promise<void> {
  try {
    const { logToAllChannels } = await import("../bot/notifications.js");
    const { brandEmbed } = await import("../bot/components/embeds.js");

    const COLOR: Partial<Record<SecurityEventType, number>> = {
      LARGE_WITHDRAWAL:     0xff2222,
      LARGE_DEPOSIT:        0xf5a623,
      TIP_BURST_DETECTED:   0xff8800,
      USER_BANNED:          0xff0000,
      USER_UNBANNED:        0x00ff88,
      WITHDRAWAL_COMPLETED: 0x00d4aa,
      PRIVATE_KEY_EXPORT:   0xffcc00,
      COMMAND_SPAM:         0xff8800,
      RATE_LIMITED:         0xffcc00,
    };

    const TITLE: Partial<Record<SecurityEventType, string>> = {
      LARGE_WITHDRAWAL:     "🚨 Large Withdrawal",
      LARGE_DEPOSIT:        "📥 Large Deposit",
      TIP_BURST_DETECTED:   "⚠️ Tip Burst",
      USER_BANNED:          "🔨 User Banned",
      USER_UNBANNED:        "✅ User Unbanned",
      WITHDRAWAL_COMPLETED: "📤 Withdrawal",
      PRIVATE_KEY_EXPORT:   "🔑 Private Key Export",
      COMMAND_SPAM:         "🛑 Command Spam",
      RATE_LIMITED:         "⏱️ Rate Limited",
      DUST_DEPOSIT_IGNORED: "🗑️ Dust Ignored",
      DEPOSIT_CREDITED:     "📥 Deposit",
    };

    const embed = brandEmbed()
      .setColor(COLOR[event.type] ?? 0x888888)
      .setTitle(TITLE[event.type] ?? `[${event.type}]`)
      .setTimestamp();

    const fields: { name: string; value: string; inline: boolean }[] = [];

    if (event.discordId) {
      fields.push({
        name: "User",
        value: `<@${event.discordId}> (\`${event.discordId}\`)`,
        inline: true,
      });
    }
    if (event.chainId) {
      const net = event.isTestnet === true ? "testnet" : event.isTestnet === false ? "mainnet" : "";
      fields.push({
        name: "Chain",
        value: `\`${event.chainId}\`${net ? ` · ${net}` : ""}`,
        inline: true,
      });
    }
    if (event.amount && event.decimals !== undefined && event.tokenSymbol) {
      const formatted = formatTokenAmount(event.amount, event.decimals);
      fields.push({
        name: "Amount",
        value: `\`${formatted} ${event.tokenSymbol}\``,
        inline: true,
      });
    }
    if (event.txHash) {
      fields.push({ name: "Tx Hash", value: `\`${event.txHash}\``, inline: false });
    }
    if (event.extra) {
      for (const [k, v] of Object.entries(event.extra)) {
        fields.push({ name: k, value: `\`${String(v)}\``, inline: true });
      }
    }

    if (fields.length > 0) embed.addFields(fields);

    await logToAllChannels([embed]);
  } catch {
    // Never let a logging failure crash the caller
  }
}
