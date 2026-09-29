import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, existsSync } from "node:fs";

// In dev (`./PEOPLE.sh --dev`) Vite serves the UI with live reload and
// forwards /api and /photos to the server on the port in config.json.
function serverPort(): number {
  try {
    const file = process.env.PM_CONFIG || "config.json";
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).server?.port || 8400;
  } catch {}
  return 8400;
}
const target = `http://127.0.0.1:${serverPort()}`;

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../dist/web", emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: { "/api": { target, changeOrigin: false }, "/photos": { target, changeOrigin: false } },
  },
});
