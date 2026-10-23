import { defineConfig } from 'vite';

// Allow loading the shared platform service from apps/shared_services in dev.
const appsRoot = new URL('../../..', import.meta.url).pathname;

export default defineConfig({
  base: '/standalone/shuyang-studio/',
  server: {
    host: '0.0.0.0',
    fs: {
      allow: [appsRoot],
    },
  },
});
