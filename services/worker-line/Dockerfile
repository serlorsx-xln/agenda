# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/db/package.json ./packages/db/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY services/worker-line/package.json ./services/worker-line/package.json
RUN pnpm install --frozen-lockfile --filter @line/worker-line...

FROM deps AS run
ENV NODE_ENV=production
RUN apk add --no-cache su-exec
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared
COPY services/worker-line ./services/worker-line
COPY scripts/worker-entrypoint.sh ./scripts/worker-entrypoint.sh
RUN chmod +x ./scripts/worker-entrypoint.sh \
  && pnpm --filter @line/worker-line exec tsx src/scripts/bake-linejs-patches.ts \
  && mkdir -p /data/session \
  && chown -R node:node /data /app
# Entrypoint runs as root to fix volume ownership, then drops to node.
USER root
EXPOSE 4000
CMD ["sh", "/app/scripts/worker-entrypoint.sh"]
