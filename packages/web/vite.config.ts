import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La UI habla con el CLI (`codegraph serve`) por /api.
// En dev, Vite corre en :5173 y proxya /api al server del CLI en :4173.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4173',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
