/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
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
