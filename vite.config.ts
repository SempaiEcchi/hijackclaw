import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: false,
      },
      "/health": {
        target: "http://127.0.0.1:8080",
        changeOrigin: false,
      },
      "/ws/terminal": {
        target: "ws://127.0.0.1:8080",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist/frontend",
  },
});
