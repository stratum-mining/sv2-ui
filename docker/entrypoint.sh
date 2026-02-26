#!/bin/sh
set -e

# Remove default nginx config if it exists (Alpine nginx ships with a default server block)
rm -f /etc/nginx/http.d/default.conf

# Start Node.js backend in background
cd /app/server
node dist/server/src/index.js &

# Start nginx in foreground
nginx -g 'daemon off;'
