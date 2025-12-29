# Build stage - lightweight for dependencies
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Production stage
FROM node:18-alpine

# Install minimal Chromium dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    ca-certificates \
    wget \
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/*

# Tell Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production \
    CHROMIUM_FLAGS="--disable-dev-shm-usage --no-sandbox"

WORKDIR /app

# Copy ONLY production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy ONLY source code (no tests, docs, config)
COPY src ./src

# Create required directories with proper permissions
RUN mkdir -p logs screenshots && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app && \
    rm -rf /root/.npm /tmp/*

USER nodejs

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/healthz || exit 1

CMD ["node", "src/app.js"]
