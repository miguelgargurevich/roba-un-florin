import { defineConfig } from "vite";

export default defineConfig({
  // el motor se importa como fuente TypeScript: Vite lo transpila al vuelo
  server: { port: 5180, strictPort: true },
  build: { target: "es2022", outDir: "dist" },
});
