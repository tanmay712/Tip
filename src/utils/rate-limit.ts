/**
 * Per-action, multi-window rate limiter with optional cooldown.
 *
 * Usage:
 *   const result = checkRateLimit(userId, "tip");
 *   if (!result.allowed) { reply with error; return; }
 *   // ... do the action ...
 *   recordUsage(userId, "tip");
 */

export type RateLimitAction =
  | "tip"
  | "rain"
  | "airdrop"
  | "withdraw"
  | "privatekey"
  | "command";

interface Window {
  count: number;
  resetAt: number;
}

interface CooldownEntry {
  lastAt: number;
}

interface WindowConfig {
  maxCount: number;
  durationMs: number;
  label: string; // human-readable e.g. "per minute"
}

interface ActionConfig {
  windows: WindowConfig[];
  cooldownMs?: number; // minimum ms between any two uses of this action
}

const CONFIGS: Record<RateLimitAction, ActionConfig> = {
  // General command spam gate — checked before any specific action
  command: {
    windows: [{ maxCount: 15, durationMs: 60_000, label: "per minute" }],
  },

  // Tips: tight per-minute cap to stop spam, generous daily cap for real tippers
  tip: {
    windows: [
      { maxCount: 5,   durationMs:       60_000, label: "per minute" },
      { maxCount: 100, durationMs: 86_400_000,   label: "per day"    },
    ],
  },

  // Rain: expensive operation, strict cap + cooldown
  rain: {
    windows: [
      { maxCount: 2, durationMs:  3_600_000, label: "per hour" },
      { maxCount: 5, durationMs: 86_400_000, label: "per day"  },
    ],
    cooldownMs: 30_000, // 30 seconds between rains
  },

  // Airdrop: same tier as rain
  airdrop: {
    windows: [
      { maxCount: 2, durationMs:  3_600_000, label: "per hour" },
      { maxCount: 5, durationMs: 86_400_000, label: "per day"  },
    ],
    cooldownMs: 30_000,
  },

  // Withdrawals: strictest — 2-min cooldown prevents scripted draining
  withdraw: {
    windows: [
      { maxCount: 3, durationMs:  3_600_000, label: "per hour" },
      { maxCount: 5, durationMs: 86_400_000, label: "per day"  },
    ],
    cooldownMs: 120_000, // 2 minutes between withdrawals
  },

  // Private key export: security-sensitive, rate-limited hard
  privatekey: {
    windows: [
      { maxCount: 3,  durationMs:  3_600_000, label: "per hour" },
      { maxCount: 10, durationMs: 86_400_000, label: "per day"  },
    ],
    cooldownMs: 10_000,
  },
};

// keyed as `userId:action:windowIndex`
const windowStore = new Map<string, Window>();
// keyed as `userId:action`
const cooldownStore = new Map<string, CooldownEntry>();

export interface RateLimitResult {
  allowed: boolean;
  /** Human-readable label for what window was exceeded, e.g. "5 per minute" */
  limitLabel?: string;
  /** ms until the user can try again */
  retryAfterMs: number;
}

/**
 * Check whether the user is allowed to perform this action.
 * Does NOT record usage — call recordUsage() after the action succeeds.
 */
export function checkRateLimit(userId: string, action: RateLimitAction): RateLimitResult {
  const config = CONFIGS[action];
  const now = Date.now();

  // Cooldown check (wall-clock since last successful use)
  if (config.cooldownMs) {
    const cd = cooldownStore.get(`${userId}:${action}`);
    if (cd) {
      const elapsed = now - cd.lastAt;
      if (elapsed < config.cooldownMs) {
        const retryAfterMs = config.cooldownMs - elapsed;
        return {
          allowed: false,
          limitLabel: `${Math.ceil(retryAfterMs / 1000)}s cooldown`,
          retryAfterMs,
        };
      }
    }
  }

  // Window checks
  for (let i = 0; i < config.windows.length; i++) {
    const wCfg = config.windows[i];
    const key = `${userId}:${action}:${i}`;
    const entry = windowStore.get(key);

    if (!entry || now >= entry.resetAt) continue; // window expired or not started — OK

    if (entry.count >= wCfg.maxCount) {
      const retryAfterMs = entry.resetAt - now;
      return {
        allowed: false,
        limitLabel: `${wCfg.maxCount} ${action}s ${wCfg.label}`,
        retryAfterMs,
      };
    }
  }

  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Record a successful use of an action.
 * Call this AFTER the action has been performed successfully.
 */
export function recordUsage(userId: string, action: RateLimitAction): void {
  const config = CONFIGS[action];
  const now = Date.now();

  if (config.cooldownMs) {
    cooldownStore.set(`${userId}:${action}`, { lastAt: now });
  }

  for (let i = 0; i < config.windows.length; i++) {
    const wCfg = config.windows[i];
    const key = `${userId}:${action}:${i}`;
    const entry = windowStore.get(key);

    if (!entry || now >= entry.resetAt) {
      windowStore.set(key, { count: 1, resetAt: now + wCfg.durationMs });
    } else {
      entry.count++;
    }
  }
}

/** Format retryAfterMs into a human-readable string like "2 minutes 15 seconds". */
export function formatRetryAfter(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `${totalSec} second${totalSec !== 1 ? "s" : ""}`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const mStr = `${mins} minute${mins !== 1 ? "s" : ""}`;
  return secs > 0 ? `${mStr} ${secs}s` : mStr;
}

// Prune stale entries every 10 minutes to keep memory clean
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windowStore) {
    if (now >= entry.resetAt) windowStore.delete(key);
  }
  for (const [key, entry] of cooldownStore) {
    if (now - entry.lastAt > 86_400_000) cooldownStore.delete(key);
  }
}, 600_000).unref();
