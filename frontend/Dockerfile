FROM node:22-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
# Drop test/lint tooling from the image build — not needed to compile and it
# increases peak memory during `next build` (common OOM/SIGKILL in Docker).
RUN npm ci \
  && npm uninstall --no-save \
    @playwright/test vitest jsdom \
    @testing-library/dom @testing-library/jest-dom @testing-library/react \
    eslint eslint-config-next

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ZITADEL_URL
ARG NEXT_PUBLIC_ZITADEL_CLIENT_ID
ARG NEXT_PUBLIC_ZITADEL_REDIRECT_URI
ARG NEXT_PUBLIC_ZITADEL_LOGOUT_URI

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ZITADEL_URL=$NEXT_PUBLIC_ZITADEL_URL
ENV NEXT_PUBLIC_ZITADEL_CLIENT_ID=$NEXT_PUBLIC_ZITADEL_CLIENT_ID
ENV NEXT_PUBLIC_ZITADEL_REDIRECT_URI=$NEXT_PUBLIC_ZITADEL_REDIRECT_URI
ENV NEXT_PUBLIC_ZITADEL_LOGOUT_URI=$NEXT_PUBLIC_ZITADEL_LOGOUT_URI
ENV NEXT_TELEMETRY_DISABLED=1
# Default 512 MB fits small VPS builds; override via build-arg on machines with more RAM.
ARG NODE_MAX_OLD_SPACE_SIZE=512
ENV NODE_OPTIONS=--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}

RUN npm run build:docker

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache wget \
  && addgroup -S nodejs \
  && adduser -S nodejs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static

USER nodejs
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3002/ || exit 1

CMD ["node", "server.js"]
