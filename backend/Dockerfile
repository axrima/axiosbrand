# Production image for the backend.
# Kept intentionally lightweight for Timeweb App Platform: no TypeScript build step in Docker.

FROM node:20-slim
WORKDIR /app

ARG CACHE_BUST=0

RUN echo "cache-bust=${CACHE_BUST}" >/dev/null
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma/
COPY prisma-rag ./prisma-rag/
COPY src ./src
COPY scripts ./scripts
COPY keys ./keys

RUN npx prisma generate
RUN mkdir -p uploads

USER root
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))"

CMD ["node", "scripts/start-server.js"]
