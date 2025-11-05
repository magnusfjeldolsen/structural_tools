import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // Base path for GitHub Pages deployment
  // Local development: / | Production: /structural_tools/2dfea/
  base: process.env.NODE_ENV === 'production' ? '/structural_tools/2dfea/' : '/',

  plugins: [react()],

  server: {
    port: 3000,
    open: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV === 'development',
    rollupOptions: {
      output: {
        // Code splitting for better caching
        manualChunks: {
          'vendor': ['react', 'react-dom', 'zustand'],
          'konva': ['konva', 'react-konva'],
        }
      }
    }
  },
});
