# Build stage - Full project (frontend + backend)
FROM node:24-alpine AS builder

WORKDIR /app

# Copy workspace package manifests so dependency installs are cached correctly
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY shared/package.json shared/

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
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/package.json /app/package-lock.json ./

# Copy shared source (Node 24 loads .ts natively)
COPY --from=builder /app/shared ./shared

# Install server production deps using workspace resolution
# so @sv2-ui/shared resolves locally instead of from the registry
RUN npm install --omit=dev -w server && rm -f package.json package-lock.json

# Create a symlink so @sv2-ui/shared resolves at runtime
RUN mkdir -p /app/node_modules/@sv2-ui && ln -s ../../shared /app/node_modules/@sv2-ui/shared

# Create data directory for configs (owner-only permissions)
RUN mkdir -m 700 -p /app/data/config

ENV NODE_ENV=production
ENV PORT=8080
ENV CONFIG_DIR=/app/data/config

# tini ensures proper signal handling (Ctrl+C works)
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

EXPOSE 8080

CMD ["node", "--import", "tsx", "dist/index.js"]
