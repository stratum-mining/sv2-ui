# Multi-stage build for SV2 UI
# 
# Build: docker build -t sv2-ui .
# Run:   docker run -p 3000:80 sv2-ui
#
# For custom backend URLs, mount a modified nginx.conf:
#   docker run -p 3000:80 -v ./my-nginx.conf:/etc/nginx/conf.d/default.conf sv2-ui

# Stage 1: Build the UI
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Production image with Nginx
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost/health || exit 1

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
