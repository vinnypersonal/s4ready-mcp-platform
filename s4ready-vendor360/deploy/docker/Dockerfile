# Multi-stage build — keeps the final image lean.
# Stage 1: build both s4ready-core and s4ready-vendor360
FROM node:20-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

# Copy core library
COPY s4ready-core/package.json ./s4ready-core/
RUN cd s4ready-core && pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY s4ready-core/ ./s4ready-core/
RUN cd s4ready-core && pnpm build

# Copy vendor360
COPY s4ready-vendor360/package.json ./s4ready-vendor360/
RUN cd s4ready-vendor360 && pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY s4ready-vendor360/ ./s4ready-vendor360/
RUN cd s4ready-vendor360 && pnpm build

# Stage 2: runtime image
FROM node:20-alpine AS runtime

RUN apk add --no-cache curl && addgroup -S s4ready && adduser -S s4ready -G s4ready

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/s4ready-core/dist/ ./s4ready-core/dist/
COPY --from=builder /app/s4ready-core/package.json ./s4ready-core/
COPY --from=builder /app/s4ready-vendor360/dist/ ./s4ready-vendor360/dist/
COPY --from=builder /app/s4ready-vendor360/package.json ./s4ready-vendor360/

# Install production deps only
RUN cd s4ready-core && npm install --production --ignore-scripts 2>/dev/null
RUN cd s4ready-vendor360 && npm install --production --ignore-scripts 2>/dev/null

USER s4ready

WORKDIR /app/s4ready-vendor360

# CRITICAL: CF and Docker both inject PORT. Always use process.env.PORT.
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "dist/server.js"]
