import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Transformacje React i lokalne proxy zachowujące prefiks /api.
// Produkcyjne serwowanie statycznego dist i routing API konfiguruje osobno Caddy.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true } },
  },
});
