/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Serves /api/ai/draft in `npm run dev` with the same handler Vercel runs, reading ANTHROPIC_API_KEY
 * (and the optional AI_ACCESS_CODE) from .env.local. Without a key the endpoint answers 501 and the
 * Generate buttons draft from the app's own file scan.
 */
function aiDraftApi(): Plugin {
  return {
    name: 'ai-draft-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      server.middlewares.use('/api/ai/draft', async (req, res) => {
        const { default: handler } = await server.ssrLoadModule('/api/ai/draft.ts');
        await handler(req, res, { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, AI_ACCESS_CODE: env.AI_ACCESS_CODE });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), aiDraftApi()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  // Pages, ExcelJS (~940 kB), docx, pdf-lib, pdf.js and the rate catalog (~2.4 MB of JSON, 160 kB
  // gzipped) are all loaded on demand, so the app opens with ~80 kB gzipped of script.
  build: { chunkSizeWarningLimit: 2500 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
