# =============================================================================
# Line Shop Runner Service - Production Dockerfile
# Multi-stage build for minimal image size and security
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# Install production dependencies in a separate stage
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
# --ignore-scripts prevents postinstall scripts that might download Chromium
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# -----------------------------------------------------------------------------
# Stage 2: Production
# Minimal runtime image with Chromium
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Labels for container metadata
LABEL org.opencontainers.image.title="Line Shop Runner Service" \
      org.opencontainers.image.description="EC-Force order automation service" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="Line Shop" \
      org.opencontainers.image.source="https://github.com/your-org/line-shop-runner-service"

# Install Chromium and minimal dependencies
# Using specific versions for reproducibility
RUN apk add --no-cache \
    chromium=~131 \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-cjk \
    dumb-init \
    && rm -rf /var/cache/apk/* /tmp/* /root/.cache

# Environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production \
    # Chromium flags for containerized environment
    CHROMIUM_FLAGS="--disable-dev-shm-usage --no-sandbox --disable-gpu --disable-software-rasterizer"

WORKDIR /app

# Create non-root user BEFORE copying files
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Copy dependencies from deps stage
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nodejs:nodejs /app/package*.json ./

# Copy source code
COPY --chown=nodejs:nodejs src ./src

# Create required directories with proper permissions
RUN mkdir -p logs screenshots && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4000

# Health check with proper timeout for browser operations
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
# This ensures graceful shutdown works correctly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/app.js"]
