import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Import the workspace package's TS source directly rather than its
      // CommonJS dist/ build — avoids ESM/CJS interop issues with Rollup's
      // static export analysis for a package that's also consumed by the
      // Node/CommonJS api app.
      '@homework-portal/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
