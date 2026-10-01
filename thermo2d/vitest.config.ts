import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', root: './packages/core', include: ['test/**/*.test.ts', 'src/**/*.test.ts'], environment: 'node', testTimeout: 120000 } },
      { test: { name: 'figures', root: './packages/figures', include: ['test/**/*.test.ts', 'src/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'server', root: './packages/server', include: ['test/**/*.test.ts', 'src/**/*.test.ts'], environment: 'node', testTimeout: 120000 } },
      { test: { name: 'app', root: '.', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], environment: 'jsdom' } },
    ],
  },
});
