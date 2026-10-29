import { defineConfig } from 'vite';

export default defineConfig({
  base: './',                       // works on github.io/shaperunner/ or any folder
  server: { port: 3000, host: true },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 },
});
