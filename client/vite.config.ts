import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/socket.io": { target: "http://127.0.0.1:3000", ws: true },
      "/health": "http://127.0.0.1:3000",
    },
  },
});
