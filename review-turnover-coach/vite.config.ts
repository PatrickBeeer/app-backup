import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/standalone/review-turnover-coach/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../..'),
    },
  },
  server: {
    host: '0.0.0.0',
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
  },
});