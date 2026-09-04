# ──────────────────────────────────────────────────────────────
# Stage 1: Build & Compile (contains TypeScript compiler & devDeps)
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npx tsc

# ──────────────────────────────────────────────────────────────
# Stage 2: Production Runtime (lean, secure, no devDependencies)
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /usr/src/app

# Install production-only dependencies and clean npm cache
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy only compiled JavaScript from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Run as non-root user (nodebestpractices 8.1 / security)
USER node

EXPOSE 3000

# Bootstrap using node command directly, avoiding npm start (nodebestpractices 8.2)
CMD ["node", "dist/server.js"]
