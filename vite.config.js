import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600, // Phaser da solo pesa ~1.2 MB
  },
  server: { host: true },
});
