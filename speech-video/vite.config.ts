import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/standalone/speech-video/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/standalone/speech-video/api': {
        target: 'http://127.0.0.1:9905',
        changeOrigin: true,
        rewrite: (url) => url.replace(/^\/standalone\/speech-video/, ''),
      },
    },
  },
});
