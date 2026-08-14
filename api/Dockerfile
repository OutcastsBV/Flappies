FROM node:22-alpine AS deps
WORKDIR /app
COPY api/package.json api/package-lock.json* ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache wget \
  && addgroup -S nodejs \
  && adduser -S nodejs -G nodejs

COPY --from=deps /app/node_modules ./node_modules
COPY api/ ./
COPY db_migrations /db_migrations
RUN chmod +x /app/docker-entrypoint.sh

ENV MIGRATIONS_DIR=/db_migrations

USER nodejs
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
