import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../config.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import { createEncryptedRecoveryBundle, createRecoveryKey } from "../../core/recovery.service.js";

const oauthStates = new Map<string, number>();
const sessions = new Map<string, { discordId: string; username: string; csrf: string; expiresAt: number }>();
const attempts = new Map<string, { window: number; count: number }>();
const SESSION_TTL = 12 * 60 * 60 * 1000;
const STATE_TTL = 10 * 60 * 1000;
const BASE = () => config.dashboard.baseUrl;

type RequestWithSession = FastifyRequest & { tipxSession?: { discordId: string; username: string; csrf: string; expiresAt: number } };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function cookies(request: FastifyRequest): Record<string, string> {
  const header = request.headers.cookie ?? "";
  return Object.fromEntries(header.split(";").map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? ["", ""] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function setCookie(reply: FastifyReply, name: string, value: string, maxAge: number): void {
  const secure = BASE().startsWith("https://") ? "; Secure" : "";
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  const current = reply.getHeader("set-cookie");
  const previous = Array.isArray(current) ? current.map(String) : current ? [String(current)] : [];
  reply.header("set-cookie", [...previous, cookie]);
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Crypto</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1rem;color:#eaf0f7;background:#111820}a{color:#76d9c4}main{background:#1b2732;padding:2rem;border-radius:14px}button{padding:.75rem 1rem;background:#00a98b;border:0;border-radius:8px;color:#fff;font-weight:700}code{overflow-wrap:anywhere}</style></head><body><main><h1>${escapeHtml(title)}</h1>${body}<p><a href="/">Crypto home</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></main></body></html>`;
}

function rateLimit(request: FastifyRequest, reply: FastifyReply, key: string): boolean {
  const ip = request.ip;
  const now = Date.now();
  const record = attempts.get(`${ip}:${key}`);
  if (!record || now - record.window > 60_000) {
    attempts.set(`${ip}:${key}`, { window: now, count: 1 });
    return false;
  }
  record.count += 1;
  if (attempts.size > 5000) {
    for (const [entry, value] of attempts) if (now - value.window > 60_000) attempts.delete(entry);
  }
  if (record.count <= 12) return false;
  reply.code(429).header("retry-after", "60").type("text/html").send(page("Slow down", "<p>Too many requests. Please wait a minute and try again.</p>"));
  return true;
}

function authenticate(request: RequestWithSession, reply: FastifyReply): boolean {
  const id = cookies(request).tipx_session;
  const session = id ? sessions.get(id) : undefined;
  if (!session || session.expiresAt < Date.now()) {
    if (id) sessions.delete(id);
    reply.code(401).type("text/html").send(page("Sign in required", '<p><a href="/auth/discord">Sign in with Discord</a> using the identify-only permission.</p>'));
    return false;
  }
  request.tipxSession = session;
  return true;
}

function validCsrf(session: { csrf: string }, submitted: unknown): boolean {
  if (typeof submitted !== "string") return false;
  const a = Buffer.from(session.csrf);
  const b = Buffer.from(submitted);
  return a.length === b.length && timingSafeEqual(a, b);
}

function guardHeaders(reply: FastifyReply): void {
  reply.header("x-content-type-options", "nosniff")
    .header("referrer-policy", "no-referrer")
    .header("x-frame-options", "DENY")
    .header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
    .header("cache-control", "no-store, max-age=0");
}

export function registerDashboardRoutes(app: FastifyInstance): void {
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });
  app.addHook("onRequest", async (_request, reply) => { guardHeaders(reply); });

  app.get("/", async (_request, reply) => reply.type("text/html").send(page("Crypto Dashboard", `
    <p>Secure account tools for Crypto. Sign-in uses Discord OAuth with the <code>identify</code> scope only. Crypto never asks for server-management permissions.</p>
    <p><a href="/auth/discord">Sign in with Discord</a></p>
    <p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></p>
    <p>Do not share recovery keys. Crypto support will never ask you to send one.</p>`)));

  app.get("/privacy", async (_request, reply) => reply.type("text/html").send(page("Privacy Policy", `
    <p><strong>Draft policy — review with qualified counsel before production.</strong></p>
    <p>Crypto processes Discord user IDs, consent records, wallet addresses, encrypted signing material, and transaction/account activity to operate the tipping service, prevent abuse, and provide account recovery.</p>
    <p>Discord OAuth is used only to verify your Discord identity with the <code>identify</code> scope. The dashboard does not request access to guilds, friends, email, or messages. Short-lived HttpOnly/SameSite cookies support login and CSRF protection; Crypto does not store the Discord OAuth access token. The dashboard temporarily uses request IP addresses for in-memory abuse rate limiting.</p>
    <p>Wallet keys are encrypted at rest. Recovery exports are encrypted with a recovery key; the encrypted backup is intended to be decrypted locally. Anyone with both the recovery key and backup can access the wallet funds. Store them separately and offline.</p>
    <p>Do not deposit funds until you understand this service's custodial risks. Contact the service operator for data questions or deletion requests.</p>`)));

  app.get("/terms", async (_request, reply) => reply.type("text/html").send(page("Terms of Service", `
    <p><strong>Draft terms — review with qualified counsel before production.</strong></p>
    <p>Crypto is experimental software, not a bank, broker, exchange, custodian, investment adviser, or source of financial advice. Use is at your own risk and subject to applicable law.</p>
    <p>Crypto transfers can be irreversible. Blockchain networks, RPC providers, and third-party services can fail. Do not deposit funds you cannot afford to lose. You are responsible for securing your recovery key and encrypted backup.</p>
    <p>The operator may suspend features to address security, legal, or operational risks. No uptime, transaction finality, asset value, or recovery guarantee is made.</p>`)));

  const recoveryTool = async (reply: FastifyReply, attachment = false) => {
    reply.header("content-security-policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
    const html = await readFile(path.join(process.cwd(), "recovery-tool.html"), "utf8");
    if (attachment) reply.header("content-disposition", 'attachment; filename="crypto-recovery-tool.html"');
    return reply.type("text/html; charset=utf-8").send(html);
  };
  app.get("/recover", async (_request, reply) => recoveryTool(reply));
  app.get("/recover-tool.html", async (_request, reply) => recoveryTool(reply, true));

  app.get("/auth/discord", async (request, reply) => {
    if (rateLimit(request, reply, "oauth")) return;
    for (const [id, session] of sessions) if (session.expiresAt < Date.now()) sessions.delete(id);
    if (!BASE() || !config.discord.clientSecret || (process.env.NODE_ENV === "production" && !BASE().startsWith("https://"))) {
      return reply.code(503).type("text/html").send(page("Sign-in not configured", "<p>Set APP_BASE_URL and DISCORD_CLIENT_SECRET to enable Discord sign-in.</p>"));
    }
    const state = randomBytes(32).toString("base64url");
    oauthStates.set(state, Date.now());
    for (const [key, at] of oauthStates) if (Date.now() - at > STATE_TTL) oauthStates.delete(key);
    const redirectUri = `${BASE()}/auth/discord/callback`;
    setCookie(reply, "tipx_oauth_state", state, 600);
    const url = new URL("https://discord.com/oauth2/authorize");
    url.searchParams.set("client_id", config.discord.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify");
    url.searchParams.set("state", state);
    return reply.redirect(url.toString());
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>("/auth/discord/callback", async (request, reply) => {
    if (rateLimit(request, reply, "oauth-callback")) return;
    const state = request.query.state ?? "";
    const issuedAt = oauthStates.get(state);
    oauthStates.delete(state);
    const cookieState = cookies(request).tipx_oauth_state ?? "";
    reply.header("set-cookie", "tipx_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (BASE().startsWith("https://") ? "; Secure" : ""));
    if (request.query.error || !request.query.code || !issuedAt || Date.now() - issuedAt > STATE_TTL || state !== cookieState) {
      return reply.code(400).type("text/html").send(page("Sign-in failed", "<p>Discord sign-in was cancelled or expired. Please retry.</p>"));
    }
    try {
      const redirectUri = `${BASE()}/auth/discord/callback`;
      const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.discord.clientId,
          client_secret: config.discord.clientSecret,
          grant_type: "authorization_code",
          code: request.query.code,
          redirect_uri: redirectUri,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!tokenResponse.ok) throw new Error("Discord OAuth token exchange failed");
      const token = await tokenResponse.json() as { access_token: string; token_type: string };
      const profileResponse = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { authorization: `${token.token_type} ${token.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!profileResponse.ok) throw new Error("Discord profile lookup failed");
      const profile = await profileResponse.json() as { id: string; username: string; global_name?: string | null };
      // The identify-only bearer is short-lived and is not stored by Crypto.
      await fetch("https://discord.com/api/v10/oauth2/token/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.discord.clientId,
          client_secret: config.discord.clientSecret,
          token: token.access_token,
        }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => undefined);
      const user = await userRepo.getUser(profile.id);
      if (!user || !(await userRepo.hasCurrentConsent(profile.id))) {
        return reply.code(403).type("text/html").send(page("Crypto account not ready", "<p>Accept Crypto's current Terms and Privacy Policy in Discord before using account recovery.</p>"));
      }
      const sessionId = randomBytes(32).toString("base64url");
      const csrf = randomBytes(32).toString("base64url");
      sessions.set(sessionId, { discordId: profile.id, username: profile.global_name || profile.username, csrf, expiresAt: Date.now() + SESSION_TTL });
      setCookie(reply, "tipx_session", sessionId, SESSION_TTL / 1000);
      return reply.redirect("/account");
    } catch {
      return reply.code(502).type("text/html").send(page("Sign-in unavailable", "<p>Discord could not verify this login. Please retry later.</p>"));
    }
  });

  app.get("/account", async (request: RequestWithSession, reply) => {
    if (!authenticate(request, reply)) return;
    const session = request.tipxSession!;
    const user = await userRepo.getUser(session.discordId);
    if (!user) return reply.code(404).type("text/html").send(page("Account not found", "<p>This Discord account has not started Crypto.</p>"));
    const recovery = user.recoveryKeyHash
      ? `<p>A recovery key has already been issued. Crypto stores only a verification hash and cannot show it again.</p><form method="post" action="/account/recovery-bundle"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><label>Recovery key <input required name="recoveryKey" autocomplete="off" spellcheck="false"></label><button>Download encrypted backup</button></form>`
      : `<p>Create your one-time recovery key. It will be shown only once; save it offline.</p><form method="post" action="/account/recovery-key"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button>Create recovery key</button></form>`;
    return reply.type("text/html").send(page("Account security", `<p>Signed in as <strong>${escapeHtml(session.username)}</strong> via Discord identify-only OAuth.</p><p>Discord ID: <code>${escapeHtml(session.discordId)}</code></p><h2>Recovery</h2>${recovery}<p>Recovery keys are not wallet private keys. They unlock an encrypted backup only when combined with that backup. Crypto cannot recover a lost key. Use the local-only decrypt tool at <a href="/recover">/recover</a> or <a href="/recover-tool.html">download the standalone tool</a>; it decrypts in your browser and does not upload the key or backup.</p><form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button>Sign out</button></form>`));
  });

  app.post<{ Body: { csrf?: string } }>("/account/recovery-key", async (request: RequestWithSession, reply) => {
    if (rateLimit(request, reply, "recovery")) return;
    if (!authenticate(request, reply)) return;
    const session = request.tipxSession!;
    if (!validCsrf(session, (request.body as { csrf?: string })?.csrf)) return reply.code(403).type("text/html").send(page("Request rejected", "<p>Reload the account page and try again.</p>"));
    try {
      const key = await createRecoveryKey(session.discordId);
      return reply.type("text/html").send(page("Save your recovery key", `<p><strong>This key is shown once. Store it offline and never send it to anyone.</strong></p><pre>${escapeHtml(key)}</pre><p>Download an encrypted backup from your account page and store the key and backup separately.</p><p><a href="/account">Continue</a></p>`));
    } catch {
      return reply.code(409).type("text/html").send(page("Recovery key not created", "<p>A key already exists or account setup is incomplete. Reload your account page.</p>"));
    }
  });

  app.post<{ Body: { csrf?: string; recoveryKey?: string } }>("/account/recovery-bundle", async (request: RequestWithSession, reply) => {
    if (rateLimit(request, reply, "recovery")) return;
    if (!authenticate(request, reply)) return;
    const session = request.tipxSession!;
    if (!validCsrf(session, (request.body as { csrf?: string })?.csrf)) return reply.code(403).type("text/html").send(page("Request rejected", "<p>Reload the account page and try again.</p>"));
    try {
      const bundle = await createEncryptedRecoveryBundle(session.discordId, (request.body as { recoveryKey?: string })?.recoveryKey ?? "");
      return reply.header("content-disposition", 'attachment; filename="crypto-encrypted-recovery.json"').type("application/json").send(bundle);
    } catch {
      return reply.code(400).type("text/html").send(page("Backup not created", "<p>The recovery key was invalid or no wallet data is available.</p>"));
    }
  });

  app.post<{ Body: { csrf?: string } }>("/auth/logout", async (request: RequestWithSession, reply) => {
    if (!authenticate(request, reply)) return;
    const session = request.tipxSession!;
    if (!validCsrf(session, (request.body as { csrf?: string })?.csrf)) return reply.code(403).type("text/html").send(page("Request rejected", "<p>Reload and try again.</p>"));
    const id = cookies(request).tipx_session;
    if (id) sessions.delete(id);
    reply.header("set-cookie", "tipx_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (BASE().startsWith("https://") ? "; Secure" : ""));
    return reply.redirect("/");
  });
}
