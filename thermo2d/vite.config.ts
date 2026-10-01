import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static bundle served at https://magnusfjeldolsen.github.io/structural_tools/thermo2d/
// (deploy-all-modules.yml copies dist/ to <gh-pages>/thermo2d/). Relative base keeps
// the bundle working from any folder, also when opened from a local http server.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5180 },
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
  worker: { format: 'es' },
});
