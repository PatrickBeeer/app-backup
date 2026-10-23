import { defineConfig } from "vite";

export default defineConfig({
  base: "/standalone/product-fission/",
  server: {
    host: "0.0.0.0",
    port: 5055,
  },
});
