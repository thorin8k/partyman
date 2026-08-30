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
RUN mkdir -p /data /uploads /backups

EXPOSE 8400
CMD ["bun", "backend.js"]
