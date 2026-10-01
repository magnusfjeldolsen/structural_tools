/** SVG → PNG with @resvg/resvg-wasm. The wasm is loaded from dist/ (copied by build.mjs) or from node_modules. */
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

let ready: Promise<typeof import('@resvg/resvg-wasm')> | null = null;

async function loadWasmBytes(): Promise<Uint8Array> {
  const candidates: string[] = [];
  try {
    candidates.push(fileURLToPath(new URL('./resvg.wasm', import.meta.url)));
  } catch {
    // not a file URL
  }
  try {
    const req = createRequire(import.meta.url);
    candidates.push(req.resolve('@resvg/resvg-wasm/index_bg.wasm'));
  } catch {
    // resolution failed; try the next
  }
  for (const c of candidates) {
    try {
      return new Uint8Array(await fs.readFile(c));
    } catch {
      // next candidate
    }
  }
  throw new Error('Could not find resvg.wasm (looked next to the bundle and in node_modules/@resvg/resvg-wasm).');
}

async function init() {
  if (!ready) {
    ready = (async () => {
      const mod = await import('@resvg/resvg-wasm');
      await mod.initWasm(await loadWasmBytes());
      return mod;
    })();
  }
  return ready;
}

/** Render an SVG string to PNG bytes. `width` scales the output (defaults to the SVG's own size). */
export async function svgToPng(svg: string, width?: number): Promise<Uint8Array> {
  const mod = await init();
  const r = new mod.Resvg(svg, {
    fitTo: width ? { mode: 'width', value: width } : { mode: 'original' },
    font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' },
    textRendering: 1,
    shapeRendering: 2,
  });
  try {
    return r.render().asPng();
  } finally {
    r.free();
  }
}
