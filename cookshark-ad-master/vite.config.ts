import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/standalone/cookshark-ad-master/',
  plugins: [react()],
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