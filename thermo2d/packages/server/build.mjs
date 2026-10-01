// Bundles the MCP server and the CLI into single-file ESM so they run with plain
// `node` on Windows (no tsx, no npx, no admin rights). resvg's wasm binary is copied
// next to the bundles (png.ts loads ./resvg.wasm first, node_modules second).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
mkdirSync('dist', { recursive: true });
const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
};
await build({ ...common, entryPoints: ['src/mcp.ts'], outfile: 'dist/mcp.mjs' });
await build({ ...common, entryPoints: ['src/cli.ts'], outfile: 'dist/cli.mjs' });
copyFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm'), 'dist/resvg.wasm');
console.log('built dist/mcp.mjs, dist/cli.mjs, dist/resvg.wasm');
