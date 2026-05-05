/**
 * Vitest global setup — imported automatically via vitest.config.ts setupFiles.
 *
 * Wires `@testing-library/jest-dom` matchers (e.g. `toBeInTheDocument`,
 * `toHaveValue`) onto Vitest's `expect`. Also registers a small handful of
 * jsdom polyfills the AI panel relies on but jsdom does not implement out
 * of the box.
 */

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL leaves mounted React trees between tests by default; clean up so each
// test starts with a fresh DOM.
afterEach(() => {
  cleanup();
});

// jsdom does not ship a TextEncoder/TextDecoder polyfill in older versions;
// the AI provider stream parser uses TextDecoder for SSE chunks. Node ships
// both as globals in modern versions, so the typeof guard is enough — no
// require() fallback needed in our supported toolchain.
if (typeof globalThis.TextEncoder === 'undefined' || typeof globalThis.TextDecoder === 'undefined') {
  throw new Error('TextEncoder/TextDecoder missing — Node 18+ is required for the test runner.');
}
