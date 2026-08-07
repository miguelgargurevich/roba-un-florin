import { defineConfig } from "vite";

export default defineConfig({
  // el motor se importa como fuente TypeScript: Vite lo transpila al vuelo
  server: { port: 5180, strictPort: true },
  /* Rutas relativas: el mismo build sirve en la raíz de un dominio propio
     (florin.gargurevich.dev) y en el subdirectorio de GitHub Pages
     (/roba-un-florin/). Con la base absoluta por defecto, en Pages el bundle
     daría 404 y solo se vería una pantalla negra. */
  base: "./",
  build: { target: "es2022", outDir: "dist" },
});
