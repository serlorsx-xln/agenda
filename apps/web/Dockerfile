# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholders only for `next build` page-data collection.
# Real secrets are injected at container runtime by docker-compose.
ENV BETTER_AUTH_SECRET=build_time_placeholder_secret_min_32_chars_xx
ENV BETTER_AUTH_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV DATABASE_URL=postgres://placeholder:placeholder@127.0.0.1:5432/placeholder
ENV INTERNAL_API_KEY=build_time_placeholder_internal_api_key_xx
ENV PROMPTPAY_ID=0812345678
ENV SCB_SLIP_URL=http://scb-slip:8000
ENV SCB_API_KEY=build_time_placeholder_scb_api_key_xxxxxxxx
ENV BILLING_WEBHOOK_SECRET=build_time_placeholder_billing_webhook_xx
ENV CRON_SECRET=build_time_placeholder_cron_secret_xxxxxxxx
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/db/package.json ./packages/db/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @line/web...
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm --filter @line/web build

FROM base AS run
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
