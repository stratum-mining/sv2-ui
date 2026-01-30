import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // In development, proxy API requests to the monitoring servers
  // This avoids CORS issues when fetching from different origins
  server: {
    proxy: {
      // Proxy requests to JDC (port 9091)
      '/jdc-api': {
        target: 'http://localhost:9091',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/jdc-api/, '/api'),
      },
      // Proxy requests to Translator (port 9092)
      '/translator-api': {
        target: 'http://localhost:9092',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/translator-api/, '/api'),
      },
      // Keep metrics proxy for direct access
      '/metrics': {
        target: 'http://localhost:9092',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Output to dist/ which will be embedded in the Rust binary
    outDir: 'dist',
    // Generate source maps for debugging
    sourcemap: true,
    // Ensure clean builds
    emptyOutDir: true,
  },
});
