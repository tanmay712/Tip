FROM node:20-alpine AS base
WORKDIR /app

# Build stage — install ALL deps, generate prisma client, compile TS
FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate
COPY tsconfig.json ./
COPY recovery-tool.html ./recovery-tool.html
COPY src ./src/
RUN npm run build

# Production deps — clean node_modules without devDeps
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev
RUN npx prisma generate

# Final production image
FROM base AS production
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/recovery-tool.html ./recovery-tool.html
COPY package.json ./

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
