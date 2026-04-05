import { prisma } from "./client.js";
import { logger } from "../utils/logger.js";

async function main() {
  logger.info("Seed complete — users and wallets are created on-demand");
}

main()
  .catch((e) => {
    logger.error(e, "Seed failed");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
