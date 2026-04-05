import { prisma } from "../client.js";

export async function getGuildConfig(guildId: string) {
  return prisma.guildConfig.findUnique({ where: { guildId } });
}

export async function setLogChannel(guildId: string, channelId: string | null) {
  return prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId, logChannelId: channelId },
    update: { logChannelId: channelId },
  });
}

export async function setAdminRole(guildId: string, roleId: string | null) {
  return prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId, adminRoleId: roleId },
    update: { adminRoleId: roleId },
  });
}

export async function banUser(discordId: string, bannedBy: string, reason?: string) {
  return prisma.bannedUser.upsert({
    where: { discordId },
    create: { discordId, bannedBy, reason: reason ?? null },
    update: { bannedBy, reason: reason ?? null },
  });
}

export async function unbanUser(discordId: string) {
  return prisma.bannedUser.delete({ where: { discordId } }).catch(() => null);
}

export async function isUserBanned(discordId: string): Promise<boolean> {
  const ban = await prisma.bannedUser.findUnique({ where: { discordId } });
  return !!ban;
}

export async function getBannedUser(discordId: string) {
  return prisma.bannedUser.findUnique({ where: { discordId } });
}
