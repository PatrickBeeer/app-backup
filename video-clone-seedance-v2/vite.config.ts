import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/standalone/video-clone-seedance-v2/',
  server: {
    host: '0.0.0.0',
    proxy: {
      '/standalone/video-clone-seedance-v2/api/execute/local-assets': {
        target: 'http://127.0.0.1:9895',
        changeOrigin: true,
        rewrite: () => '/api/execute/local-assets',
      },
      '/standalone/video-clone-seedance-v2/api/execute/run': {
        target: 'http://127.0.0.1:9895',
        changeOrigin: true,
        rewrite: () => '/api/run',
      },
      '/standalone/video-clone-seedance-v2/api/run': {
        target: 'http://127.0.0.1:9895',
        changeOrigin: true,
        rewrite: () => '/api/run',
      },
      '/standalone/video-clone-seedance-v2/api/health': {
        target: 'http://127.0.0.1:9895',
        changeOrigin: true,
        rewrite: () => '/api/health',
      },
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
