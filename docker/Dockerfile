# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci
COPY server/ ./server/
COPY src/config-templates/ ./src/config-templates/
# Root package.json needed so config-templates (outside server/) inherits "type": "module"
COPY package.json ./
RUN cd server && npx tsc

# Stage 3: Runtime (node + nginx)
FROM node:20-alpine
RUN apk add --no-cache nginx
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY --from=backend-builder /app/server/dist /app/server/dist
COPY --from=backend-builder /app/server/node_modules /app/server/node_modules
COPY --from=backend-builder /app/server/package.json /app/server/
COPY docker/nginx.conf /etc/nginx/http.d/sv2.conf
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/bitcoin-core-ipc /app/bitcoin-core-ipc
RUN mkdir -p /data/configs && chmod +x /entrypoint.sh
EXPOSE 2121
VOLUME ["/data"]
ENTRYPOINT ["/entrypoint.sh"]
