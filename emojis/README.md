# Crypto application emoji assets

Drop image files in this folder and run `npm run emojis:upload` to create or update matching **application emojis** in the Discord Developer Portal. The filename (without its extension) becomes the emoji name; use lowercase names such as `tip.png`, `wallet.png`, or `success.gif` to override the corresponding fallback emoji in Crypto.

Supported formats: PNG, JPG/JPEG, GIF, and WebP. Keep each file within Discord's current application-emoji size limits. The upload command needs `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` in `.env`; the bot application must be authorized to manage its application emojis. Uploaded IDs are written to `src/utils/custom-emojis.generated.ts` and are used automatically on the next build/start. Keep this folder for source artwork; don't commit private keys or secrets here.
