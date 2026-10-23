import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/standalone/wall-display-designer/',
  server: {
    host: '0.0.0.0',
    port: 4795,
    strictPort: true
  }
});
