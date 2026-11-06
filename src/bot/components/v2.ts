import { MessageFlags, type MessageCreateOptions, type MessageEditOptions } from "discord.js";

type LegacyEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  author?: { name?: string; url?: string; icon_url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text?: string; icon_url?: string };
  image?: { url?: string };
  thumbnail?: { url?: string };
  timestamp?: string;
};
type Payload = Record<string, any>;

function embedJson(embed: any): LegacyEmbed {
  return typeof embed?.toJSON === "function" ? embed.toJSON() : embed;
}

function embedText(embed: LegacyEmbed): string {
  const parts: string[] = [];
  if (embed.author?.name) parts.push(`**${embed.author.name}**`);
  if (embed.title) parts.push(embed.url ? `## [${embed.title}](${embed.url})` : `## ${embed.title}`);
  if (embed.description) parts.push(embed.description);
  for (const field of embed.fields ?? []) parts.push(`**${field.name}**\n${field.value}`);
  if (embed.image?.url) parts.push(embed.image.url);
  if (embed.thumbnail?.url) parts.push(embed.thumbnail.url);
  if (embed.footer?.text) parts.push(`-# ${embed.footer.text}`);
  if (embed.timestamp) parts.push(`-# ${embed.timestamp}`);
  return parts.filter(Boolean).join("\n\n") || " ";
}

function textDisplayBlocks(text: string): Array<{ type: 10; content: string }> {
  const blocks: Array<{ type: 10; content: string }> = [];
  let remaining = text || " ";
  while (remaining.length > 4000) {
    let splitAt = remaining.lastIndexOf("\n", 4000);
    if (splitAt < 2000) splitAt = 4000;
    blocks.push({ type: 10, content: remaining.slice(0, splitAt) });
    remaining = remaining.slice(splitAt).trimStart();
  }
  blocks.push({ type: 10, content: remaining });
  return blocks;
}

/** Convert legacy embed/content payloads into Discord's Components V2 container layout. */
export function toComponentsV2(input: unknown): Payload {
  const payload: Payload = typeof input === "string" ? { content: input } : { ...((input ?? {}) as Payload) };
  const sourceEmbeds = Array.isArray(payload.embeds) ? payload.embeds : [];
  const content = typeof payload.content === "string" ? payload.content : "";
  const blocks = [
    ...(content ? textDisplayBlocks(content) : []),
    ...sourceEmbeds.flatMap((embed: any) => textDisplayBlocks(embedText(embedJson(embed)))),
  ];

  delete payload.embeds;
  delete payload.content;
  if (blocks.length) {
    payload.components = [
      { type: 17, accent_color: sourceEmbeds.length ? embedJson(sourceEmbeds[0]).color : undefined, components: blocks },
      ...(Array.isArray(payload.components) ? payload.components : []),
    ];
  }
  payload.flags = Number(payload.flags ?? 0) | MessageFlags.IsComponentsV2;
  if (payload.ephemeral) {
    payload.flags |= MessageFlags.Ephemeral;
    delete payload.ephemeral;
  }
  return payload;
}

/** Apply V2 conversion to all responses emitted by an interaction during a callback. */
export async function withComponentsV2<T>(interaction: object, callback: () => Promise<T>): Promise<T> {
  const target = interaction as Record<string, any>;
  const names = ["reply", "editReply", "followUp", "deferReply"] as const;
  for (const name of names) {
    const original = target[name];
    if (typeof original !== "function") continue;
    Object.defineProperty(target, name, {
      configurable: true,
      value: (...args: any[]) => original.apply(interaction, [toComponentsV2(args[0]), ...args.slice(1)]),
    });
  }
  try {
    return await callback();
  } finally {
    for (const name of names) delete target[name];
  }
}

/** Keep the message-command UI on V2 while preserving the normal Message.reply behavior. */
export async function withComponentsV2Message<T>(message: object, callback: () => Promise<T>): Promise<T> {
  const target = message as Record<string, any>;
  const original = target.reply;
  if (typeof original !== "function") return callback();
  Object.defineProperty(target, "reply", {
    configurable: true,
    value: (...args: any[]) => original.apply(message, [toComponentsV2(args[0]), ...args.slice(1)]),
  });
  try {
    return await callback();
  } finally {
    delete target.reply;
  }
}

export type V2ReplyPayload = MessageCreateOptions | MessageEditOptions;
