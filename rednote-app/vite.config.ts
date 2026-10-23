import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Frontend is served by app-manager at /standalone/rednote-app/.
// In dev, proxy the BFF (/standalone/rednote-app/api/run) to the local Node BFF.
export default defineConfig({
  base: '/standalone/rednote-app/',
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/standalone/rednote-app/api': 'http://127.0.0.1:9899',
    },
  },
});
