# Runs the API (mainly /api/admin for d2r-admin) on myhost. Production still deploys to Cloud Functions.
# The DB is not baked in: mount a volume and point DB_PATH at the d2r.sqlite in it
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
COPY . .
# `npm ci --omit=dev` rejects this lock file over optional wasm deps, so prune the full install instead
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
ENV PORT=3001
EXPOSE 3001
CMD ["node", "dist/src/main"]
