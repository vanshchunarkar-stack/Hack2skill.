# ────────────────────────────────────────────────────────────────────
# Blindspot — Production Dockerfile (Cloud Run compatible)
# Multi-stage build for minimal image size
# ────────────────────────────────────────────────────────────────────

FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# ────────────────────────────────────────────────────────────────────

FROM node:18-alpine

WORKDIR /app

# Security: run as non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

# Environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

CMD ["node", "server.js"]
