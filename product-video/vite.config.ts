import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = String(env.PRODUCT_VIDEO_BACKEND_PORT || env.PORT || '9897').trim() || '9897';
  const backendTarget = String(env.PRODUCT_VIDEO_BACKEND_URL || `http://127.0.0.1:${backendPort}`).replace(/\/+$/, '');

  return {
    base: '/standalone/product-video/',
    plugins: [react()],
    server: {
      proxy: {
        '/standalone/product-video/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/api_manager': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
        },
        '/api/v1/task-manager': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
        },
        '/user-manager': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
        },
        '/pay-service': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
        },
      },
    },
  };
});
