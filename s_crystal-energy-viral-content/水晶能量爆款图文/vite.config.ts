import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_BASE_URL': JSON.stringify(env.API_BASE_URL),
        'process.env.TEXT_API_KEY': JSON.stringify(env.TEXT_API_KEY),
        'process.env.IMAGE_API_KEY': JSON.stringify(env.IMAGE_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
