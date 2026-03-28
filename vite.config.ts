import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        telao: resolve(__dirname, 'index.html'),
        painel: resolve(__dirname, 'src/painel/painel.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
      '/video': 'http://localhost:3000',
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
});