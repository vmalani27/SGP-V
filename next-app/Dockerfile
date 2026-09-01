# syntax=docker/dockerfile:1

###############################################################################
# deps - install locked dependencies
###############################################################################
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

###############################################################################
# dev - development server
###############################################################################
FROM deps AS dev
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]

###############################################################################
# build - compile Next.js standalone build
###############################################################################
FROM deps AS build
WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

COPY . .
RUN mkdir -p /app/public
RUN npm run build

###############################################################################
# runtime - secure non-root production runner
###############################################################################
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Content directory must be writable by nextjs user for S3 tarball unpacking
RUN mkdir -p /app/.content && chown -R nextjs:nodejs /app/.content

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]