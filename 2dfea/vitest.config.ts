/**
 * Vitest configuration — single suite for the entire 2dfea module.
 *
 * Convention: tests live next to their source as `<name>.test.ts`. There is
 * no `__tests__/` directory, no `tests/` root. One config, one command.
 *
 * Future features must follow the same convention. Adding a second
 * `vitest.config.ts` would split the suite — don't.
 *
 * Run with `npm test` (alias of `vitest run`); see package.json scripts.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Explicit imports of describe/it/expect — clearer for AI tooling and humans.
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'public'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
