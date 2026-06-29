import { defineConfig } from 'vite';
import path from 'path';
import comlink from 'vite-plugin-comlink';

export default defineConfig({
  root: 'public',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'public/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    open: '/index.html',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@api': path.resolve(__dirname, 'src/api'),
      '@types': path.resolve(__dirname, 'src/types'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@workers': path.resolve(__dirname, 'src/workers'),
    },
  },
  worker: {
    format: 'es',
    plugins: () => [comlink()],
  },
  plugins: [comlink()],
});