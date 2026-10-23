import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/standalone/video-clone-seedance/',
  server: {
    host: '0.0.0.0',
    proxy: {
      '/standalone/video-clone-seedance/api': 'http://127.0.0.1:9896',
    },
    fs: {
      allow: [path.resolve(__dirname)],
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
