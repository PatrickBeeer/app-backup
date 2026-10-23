import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const suiteBasePath = './';

  return {
    plugins: [react(), tailwindcss()],
    base: suiteBasePath,
    define: {
      'process.env.VITE_BUILD_STAMP': JSON.stringify(env.VITE_BUILD_STAMP || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api_manager/api/v1/execute': {
          target: 'http://127.0.0.1:3051',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
  };
});
