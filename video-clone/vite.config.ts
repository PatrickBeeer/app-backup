import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/standalone/video-clone/',
  server: {
    host: '0.0.0.0',
    proxy: {
      '/standalone/video-clone/api': 'http://127.0.0.1:9898',
    },
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
  },
  plugins: [react()],
  optimizeDeps: {
    // ffmpeg.wasm resolves its own module worker at runtime. Pre-bundling the
    // package rewrites that URL into node_modules/.vite/deps/worker.js, which
    // does not exist and leaves video preparation waiting forever.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/core', '@ffmpeg/util'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../..'),
    },
  },
});
