import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "src/client",
  server: {
    proxy: {
      "/api": "http://127.0.0.1:5555",
    },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
});
