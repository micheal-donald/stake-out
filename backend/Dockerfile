# Production Dockerfile for Battle Arena Backend
# Multi-stage build for optimized production image

# ===================================
# Stage 1: Build Dependencies
# ===================================
FROM node:18-alpine AS dependencies

# Set working directory
WORKDIR /app

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install dependencies with production optimizations
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# ===================================
# Stage 2: Production Runtime
# ===================================
FROM node:18-alpine AS production

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S stakeout -u 1001 -G nodejs

# Install runtime security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy dependencies from build stage
COPY --from=dependencies --chown=stakeout:nodejs /app/node_modules ./node_modules

# Copy application source
COPY --chown=stakeout:nodejs . .

# Create logs directory
RUN mkdir -p logs && chown stakeout:nodejs logs

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (res) => { \
    if (res.statusCode === 200) process.exit(0); else process.exit(1); \
  }).on('error', () => process.exit(1))"

# Switch to non-root user
USER stakeout

# Expose port
EXPOSE 4000

# Start application with dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]

# Metadata
LABEL maintainer="Battle Arena Team"
LABEL version="1.0.0"
LABEL description="Battle Arena Backend Service - Production"