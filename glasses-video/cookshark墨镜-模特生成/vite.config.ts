import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3111,
        host: '0.0.0.0',
        proxy: {
          '/api/video': 'http://127.0.0.1:8787',
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_IMAGE_API_KEY': JSON.stringify(env.GEMINI_IMAGE_API_KEY),
        'process.env.GEMINI_API_BASE_URL': JSON.stringify(env.GEMINI_API_BASE_URL),
        'process.env.GEMINI_IMAGE_MODEL': JSON.stringify(env.GEMINI_IMAGE_MODEL)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
