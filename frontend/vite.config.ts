import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3300",
      "/ws": {
        target: "ws://localhost:3300",
        ws: true,
      },
    },
    port: 3341,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/echarts") ||
            id.includes("node_modules/zrender")
          ) {
            return "echarts";
          }
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom")
          ) {
            return "react";
          }
        },
      },
    },
  },
});
