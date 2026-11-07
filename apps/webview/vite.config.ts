import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Fixed file names, so each host (VS Code extension, desktop app) can reference them from its
// own HTML page, which carries that host's CSP.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("dist", import.meta.url)),
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    rolldownOptions: {
      input: fileURLToPath(new URL("src/main.tsx", import.meta.url)),
      output: {
        entryFileNames: "assets/main.js",
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith(".css"))
            ? "assets/main.css"
            : "assets/[name][extname]",
      },
    },
  },
});
