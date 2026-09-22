import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS && process.env.VITE_HOSTINGER !== 'true' ? '/freedom-arena/' : '/',
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app-[hash].js',
        chunkFileNames: 'assets/chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
