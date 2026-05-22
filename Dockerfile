# Build stage - Full project (frontend + backend)
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY server/package.json server/

# Install all dependencies
RUN npm ci

# Copy source
COPY . .

# Build frontend
RUN npm run build

# Build backend
WORKDIR /app/server
RUN npm run build

# Production stage
FROM node:24-alpine

WORKDIR /app

# Copy built frontend to public/
COPY --from=builder /app/dist ./public

# Copy built backend
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/package.json ./

# Copy shared config (ports.json)
COPY --from=builder /app/shared ./shared

# Install production dependencies only
RUN npm install --omit=dev

# Create data directory for configs
RUN mkdir -p /app/data/config

ENV NODE_ENV=production
ENV PORT=8080
ENV CONFIG_DIR=/app/data/config

# tini ensures proper signal handling (Ctrl+C works)
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

EXPOSE 8080

CMD ["node", "dist/index.js"]
