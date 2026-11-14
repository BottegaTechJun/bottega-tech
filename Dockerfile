FROM oven/bun:1 AS base
WORKDIR /app

# Copy monorepo manifests, lockfile, and sources owned by the non-root bun user
COPY --chown=bun:bun . .

# Install workspace dependencies and ensure writable runtime fallback directories
RUN bun install --frozen-lockfile && \
    mkdir -p /app/apps/api/data/profiles /app/apps/api/.runs && \
    chown -R bun:bun /app

USER bun
WORKDIR /app/apps/api
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
