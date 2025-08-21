# Production Dockerfile for Stake Out Bet Frontend
# Multi-stage build for optimized production image

# ===================================
# Stage 1: Build Application
# ===================================
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache git && \
    rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --no-audit --no-fund

# Copy source code
COPY . .

# Build optimizations
ENV NODE_ENV=production
ENV GENERATE_SOURCEMAP=false
ENV REACT_APP_API_URL=__API_URL_PLACEHOLDER__
ENV REACT_APP_WS_URL=__WS_URL_PLACEHOLDER__

# Build the application
RUN npm run build

# Optimize build output
RUN find build -name "*.map" -type f -delete && \
    find build -name "*.txt" -type f -delete

# ===================================
# Stage 2: Production Runtime
# ===================================
FROM nginx:alpine AS production

# Install security updates and tools
RUN apk update && apk upgrade && \
    apk add --no-cache curl jq && \
    rm -rf /var/cache/apk/*

# Remove default nginx website
RUN rm -rf /usr/share/nginx/html/*

# Copy built application from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf
COPY nginx-default.conf /etc/nginx/conf.d/default.conf

# Create nginx user and set permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Create environment substitution script
COPY <<'EOF' /docker-entrypoint.d/30-env-substitution.sh
#!/bin/sh
set -e

# Default values
API_URL=${API_URL:-"http://localhost:4000"}
WS_URL=${WS_URL:-"ws://localhost:4000"}

echo "Substituting environment variables..."
echo "API_URL: $API_URL"
echo "WS_URL: $WS_URL"

# Find all JavaScript files and replace placeholders
find /usr/share/nginx/html -name "*.js" -type f -exec sed -i \
    -e "s|__API_URL_PLACEHOLDER__|$API_URL|g" \
    -e "s|__WS_URL_PLACEHOLDER__|$WS_URL|g" \
    {} \;

echo "Environment variable substitution completed"
EOF

# Make script executable
RUN chmod +x /docker-entrypoint.d/30-env-substitution.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:80/ || exit 1

# Switch to nginx user
USER nginx

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# Metadata
LABEL maintainer="Stake Out Bet Team"
LABEL version="1.0.0"
LABEL description="Stake Out Bet Frontend Service - Production"