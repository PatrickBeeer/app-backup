import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  base: '/standalone/ai-studio-prompt-assist/',
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
