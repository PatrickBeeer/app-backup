import { defineConfig } from 'vite';

// 器物光场 (tea-and-repast) — vanilla-JS standalone app.
//
// Served by app-manager from dist/, so the Vite base MUST match the
// standalone hosting route (see standalone_app_host_handbook.md §1/§B):
//   base: '/standalone/tea-and-repast/'
// The main-frontend shell loads this app at /app/tea-and-repast, which
// iframes /standalone/tea-and-repast/ (served by app-manager).
export default defineConfig({
  base: '/standalone/tea-and-repast/',
  server: {
    port: 3000,
    host: '0.0.0.0',
    // In local dev (port 3000) the location is not under /standalone/...,
    // so the in-app client falls back to /api_manager/.../llm-generate.
    // Proxy those to the running app-manager so dev can call api-manager.
    proxy: {
      '/api_manager': 'http://127.0.0.1:3002',
      '/standalone': 'http://127.0.0.1:3002',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
