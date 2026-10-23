import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/standalone/s_selling-point-visual-video_v4/',
  server: {
    host: '0.0.0.0',
    proxy: {
      '/llm-text': {
        target: 'https://llm-api.net',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/llm-text/, ''),
      },
      '/llm-image': {
        target: 'https://llm-api.net',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/llm-image/, ''),
      },
    },
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../..'),
    },
  },
});
