FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN bun compile

# Production stage
FROM oven/bun:1-slim
WORKDIR /usr/src/app
COPY --from=base /usr/src/app/dist ./
# Las migraciones no van en el bundle: copiarlas para el runner (migrate.ts las busca junto al binario o en cwd).
COPY --from=base /usr/src/app/migrations ./migrations
RUN mkdir -p /data /uploads /data/backups

EXPOSE 8400
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "if(await fetch('http://127.0.0.1:'+(process.env.PORT||'8400')+'/api/health').then(r=>r.ok).catch(()=>false))process.exit(0);else process.exit(1)"
CMD ["bun", "backend.js"]
