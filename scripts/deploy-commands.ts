import { deployCommands } from "../src/bot/deploy-commands.js";

deployCommands()
  .then(() => {
    console.log("Commands deployed successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to deploy commands:", err);
    process.exit(1);
  });
