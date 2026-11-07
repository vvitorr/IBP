import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Builds straight into the extension's dist/webview with fixed file names, so the extension
// host can reference them from its own HTML (which carries the CSP nonce).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("../extension/dist/webview", import.meta.url)),
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
