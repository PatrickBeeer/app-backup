import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
    return {
      base: '/standalone/ai-any-wear/',
      server: {
        port: 3000,
        host: '0.0.0.0',
        fs: {
          allow: [path.resolve(__dirname, '../..')],
        },
      },
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
